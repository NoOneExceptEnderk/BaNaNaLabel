import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { parseStringPromise, Builder } from 'xml2js';

const RECENT_DIRECTORIES_KEY = 'recentDirectories';

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('BaNaNaLabel.addLabel', async () => {
        const recentDirectories = context.globalState.get<string[]>(RECENT_DIRECTORIES_KEY, []);
        const lastDirectory = recentDirectories.length > 0 ? recentDirectories[0] : null;

        const panel = vscode.window.createWebviewPanel(
            'BaNaNaLabel',
            'BaNaNaLabel',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
            }
        );
        panel.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'media', 'icon.png'));
        if (lastDirectory && fs.existsSync(lastDirectory)) {
            const files = fs.readdirSync(lastDirectory);
            panel.webview.html = getWebviewContent(lastDirectory, files, recentDirectories);
        } else {
            panel.webview.html = getInitialWebviewContent(recentDirectories);
        }

        panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'selectDirectory':
                    await handleSelectDirectory(context, panel);
                    break;
                case 'addLabel':
                    await handleAddLabel(context, message, panel);
                    break;
                case 'selectScript':
                    await handleSelectScript(context);
                    break;
                case 'openRecentDirectory':
                    await handleOpenRecentDirectory(context, message, panel);
                    break;
            }
        });
    });

    context.subscriptions.push(disposable);
}

async function handleSelectDirectory(context: vscode.ExtensionContext, panel: vscode.WebviewPanel) {
    const selectedFolder = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false
    });

    if (selectedFolder && selectedFolder.length > 0) {
        const selectedDir = selectedFolder[0].fsPath;
        const files = fs.readdirSync(selectedDir);
        let updatedRecentDirectories = context.globalState.get<string[]>(RECENT_DIRECTORIES_KEY, []);
        updatedRecentDirectories = updatedRecentDirectories.filter(dir => dir !== selectedDir);
        updatedRecentDirectories.unshift(selectedDir);
        if (updatedRecentDirectories.length > 5) {
            updatedRecentDirectories.pop();
        }
        await context.globalState.update(RECENT_DIRECTORIES_KEY, updatedRecentDirectories);
        panel.webview.html = getWebviewContent(selectedDir, files, updatedRecentDirectories);
    }
}

async function handleAddLabel(context: vscode.ExtensionContext, message: any, panel: vscode.WebviewPanel) {
    const { label, files, directory, runScript } = message;
    if (!label || files.some((file: { file: string, value: string }) => !file.value)) {
        vscode.window.showErrorMessage('The label name and value cannot be null.');
        return;
    }

    for (const { file, value } of files) {
        const absoluteFilePath = path.join(directory, file);
        if (!fs.existsSync(absoluteFilePath)) {
            vscode.window.showErrorMessage(`File "${absoluteFilePath}" does not exist.`);
            continue;
        }

        try {
            const fileContent = fs.readFileSync(absoluteFilePath, 'utf8').trim();
            if (file.endsWith('.json')) {
                await handleJsonFile(label, value, absoluteFilePath, fileContent);
            } else if (file.endsWith('.xml')||file.endsWith('.resx')) {
                await handleXmlFile(label, value, absoluteFilePath, fileContent);
            }
        } catch (error) {
            if (error instanceof Error) {
                vscode.window.showErrorMessage(`Error processing file "${absoluteFilePath}": ${error.message}`);
            }
        }
    }
    vscode.window.showInformationMessage(`Label "${label}" added to selected files.`);

    if (runScript) {
        await runSelectedScript(context);
    }
}

async function handleJsonFile(label: string, value: string, absoluteFilePath: string, fileContent: string) {
    let jsonContent: { [key: string]: any } = {};
    if (fileContent) {
        jsonContent = JSON.parse(fileContent);
    }
    if (jsonContent.hasOwnProperty(label)) {
        vscode.window.showErrorMessage(`Label "${label}" already exists in file "${absoluteFilePath}" with value "${jsonContent[label]}".`);
        return;
    }
    jsonContent[label] = value;
    fs.writeFileSync(absoluteFilePath, JSON.stringify(jsonContent, null, 2), 'utf8');
}

async function handleXmlFile(label: string, value: string, absoluteFilePath: string, fileContent: string) {
    let xmlContent;
    if (fileContent) {
        xmlContent = await parseStringPromise(fileContent);
    } else {
        xmlContent = { root: { data: [] } };
    }
    if (!xmlContent.root) {
        xmlContent.root = { data: [] };
    }
    if (!xmlContent.root.data) {
        xmlContent.root.data = [];
    }
    const existingLabel = xmlContent.root.data.find((item: any) => item.$.name === label);
    if (existingLabel) {
        vscode.window.showErrorMessage(`Label "${label}" already exists in file "${absoluteFilePath}" with value "${existingLabel.value}".`);
        return;
    }
    xmlContent.root.data.push({
        $: { name: label },
        value: value
    });
    const builder = new Builder({ headless: false, renderOpts: { pretty: true, indent: '  ', newline: '\n' } });
    const newXmlContent = builder.buildObject(xmlContent);

    fs.writeFileSync(absoluteFilePath, newXmlContent, 'utf8');
}

async function handleSelectScript(context: vscode.ExtensionContext) {
    const selectedScript = await vscode.window.showOpenDialog({
        canSelectFolders: false,
        canSelectFiles: true,
        canSelectMany: false
    });

    if (selectedScript && selectedScript.length > 0) {
        const scriptPath = selectedScript[0].fsPath;
        await context.globalState.update('selectedScript', scriptPath);
        vscode.window.showInformationMessage(`Selected script: "${scriptPath}"`);
    }
}

async function handleOpenRecentDirectory(context: vscode.ExtensionContext, message: any, panel: vscode.WebviewPanel) {
    const selectedDir = message.directory;
    const files = fs.readdirSync(selectedDir);

    let updatedRecentDirectories = context.globalState.get<string[]>(RECENT_DIRECTORIES_KEY, []);
    updatedRecentDirectories = updatedRecentDirectories.filter(dir => dir !== selectedDir);
    updatedRecentDirectories.unshift(selectedDir);
    if (updatedRecentDirectories.length > 5) {
        updatedRecentDirectories.pop();
    }
    await context.globalState.update(RECENT_DIRECTORIES_KEY, updatedRecentDirectories);
    panel.webview.html = getWebviewContent(selectedDir, files, updatedRecentDirectories);
}

export function deactivate() {}

function getInitialWebviewContent(recentDirectories: string[]) {
    const recentDirsOptions = recentDirectories.map(dir => `<option value="${dir}">${dir}</option>`).join('');

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>BaNaNaLabel</title>
            <script src="https://kit.fontawesome.com/bdac89dd37.js" crossorigin="anonymous"></script>
            <style>
            *{
            font-size: 20px;
            margin-top: 5px;
            }
            body{
                background-color:black;
            }
            #directoryDiv {
                display: flex;
                align-items: center;
            }
            .dirElem {
                margin-right: 10px;
                padding: 5px;
            }
            h1{
            font-size: 48px;
            }
            #folderIcon {
                margin-left: 5px;
            }
           #LblNameDiv{
            display:flex;
            flex-direction:column;
            max-width:200px;
            }
            #labelName{
            max-width: 150px;
            resize: horizontal;
            }
            button,input,select{
            color: hsla(207, 11%, 39%, 1);;
            background-color:white;
            border-color: hsla(207, 11%, 39%, 1);
            border-style:solid;
            border-width: 1px;
            border-radius: 5px;
            padding: max(5px);

            }
            select{
            padding:5px;
            max-width:140px;
            }
            select,input{
            max-width:80px;
            }
            select:hover ,input:hover,button:hover,button:active{
                background-color:lightgrey;
                color : black;
            }
            #AddBtn{
            width: 100px;
            color:hsla(50, 100%, 52%, 1);
            border-color:hsla(50, 100%, 52%, 1);
            background-color:black;
            }
            #AddBtn:hover,#AddBtn:active{
            background-color:hsla(50, 100%, 52%, 1);
            color:black;
            border-color: black;
            }
            #title{
            color: hsla(50, 100%, 52%, 1);
            }
            input{
            min-width: 180px
            max-width: 400px;
            }
        </style>
        </head>
        <body>
            <h1 id="title">BaNaNaLabel</h1>
            <button onclick="selectDirectory()" tabindex="-1">Select Directory <i class="fa-solid fa-folder"></i></button>
            <select id="recentDirectories" onchange="selectRecentDirectory()">
                <option value="">Recent folders</option>
                ${recentDirsOptions}
            </select>
            <script>
                const vscode = acquireVsCodeApi();

                function selectDirectory() {
                    vscode.postMessage({
                        command: 'selectDirectory'
                    });
                }

                function selectRecentDirectory() {
                    const select = document.getElementById('recentDirectories');
                    const directory = select.value;
                    if (directory) {
                        vscode.postMessage({
                            command: 'openRecentDirectory',
                            directory: directory
                        });
                    }
                }

                document.addEventListener('keydown', function(event) {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        document.getElementById('AddBtn').click();
                    }
                });
            </script>
        </body>
        </html>
    `;
}

function getWebviewContent(directory: string, files: string[], recentDirectories: string[]) {
    const fileCheckboxes = files.map(file => `
        <input type="checkbox" id="${file}" name="files" value="${file}" onchange="toggleInput('${file}')" onkeydown="handleCheckboxKeydown(event, '${file}')">
        <label for="${file}">${file}</label>
        <input type="text" id="value_${file}" name="value_${file}" placeholder="Label Value" style="display:none; resize: horizontal;" onblur="checkInput('${file}')" onkeydown="handleInputKeydown(event, '${file}')"><br>
    `).join('');

    const recentDirsOptions = recentDirectories.map(dir => `<option value="${dir}">${dir}</option>`).join('');

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>BaNaNaLabel</title>
            <script src="https://kit.fontawesome.com/bdac89dd37.js" crossorigin="anonymous"></script>
            <style>
            *{
            font-size: 18px;
            margin-top: 5px;
            }
            body{
                background-color:black;
            }
            #directoryDiv {
                display: flex;
                align-items: center;
            }
            .dirElem {
                margin-right: 10px;
                padding: 5px;
            }
            h1{
            font-size: 48px;
            }
            #folderIcon {
                margin-left: 5px;
            }
           #LblNameDiv{
            display:flex;
            flex-direction:column;
            max-width:200px;
            }
            #labelName{
            max-width: 150px;
            resize: horizontal;
            }
            button,input,select{
            color: hsla(207, 11%, 39%, 1);;
            background-color:white;
            border-color: hsla(207, 11%, 39%, 1);
            border-style:solid;
            border-width: 1px;
            border-radius: 5px;
            padding: max(5px);

            }
            select{
            padding:5px;
            max-width:140px;
            }
            select,input{
            max-width:80px;
            }
            select:hover ,input:hover,button:hover,button:active{
                background-color:lightgrey;
                color : black;
            }
            #AddBtn{
            width: 100px;
            color:hsla(50, 100%, 52%, 1);
            border-color:hsla(50, 100%, 52%, 1);
            background-color:black;
            }
            #AddBtn:hover,#AddBtn:active{
            background-color:hsla(50, 100%, 52%, 1);
            color:black;
            border-color: black;
            }
            #title{
            color: hsla(50, 100%, 52%, 1);
            }
            input{
            min-width: 180px
            max-width: 400px;
            }
        </style>
        </head>
        <body>
            <h1 id="title">BaNaNaLabel</h1>
            <div id="directoryDiv">
            <button class="dirElem" onclick="selectDirectory()" tabindex="-1"> ${directory} <i id="folderIcon" class="fa-regular fa-folder"></i></button>
        <select class="dirElem" id="recentDirectories" onchange="selectRecentDirectory()">
            <option value="">Recent folders</i></option>
            ${recentDirsOptions}
        </select>
        </div>
            <form id="labelForm">
            <div id="LblNameDiv">
                <label  for="labelName">Label name</label>
                <input type="text" id="labelName" placeholder="LabelName" name="labelName" style="resize: horizontal;"><br><br>
                </div>
                <label for="files">File list</label><br>
                ${fileCheckboxes}
                <button id="AddBtn" type="button" onclick="addLabel()" tabindex="-1">Add Label</button>
                <button class="dirElem" type="button" onclick="selectScript()" tabindex="-1">Select Script <i class="fa-solid fa-file-code"></i></button>
                <input type = "checkbox" id = "runScript" name = "runScript" onchange = "toggleScriptRun()">Run Script</input>
            </form>
            <script>
                const vscode = acquireVsCodeApi();

                function selectDirectory() {
                    vscode.postMessage({
                        command: 'selectDirectory'
                    });
                }

                function selectRecentDirectory() {
                    const select = document.getElementById('recentDirectories');
                    const directory = select.value;
                    if (directory) {
                        vscode.postMessage({
                            command: 'openRecentDirectory',
                            directory: directory
                        });
                    }
                }

                function selectScript() {
                    vscode.postMessage({
                        command: 'selectScript'
                    });
                }

                function toggleInput(file) {
                    const input = document.getElementById('value_' + file);
                    input.style.display = input.style.display === 'none' ? 'inline' : 'none';
                    if (input.style.display === 'inline') {
                        input.focus();
                    }
                }

                function checkInput(file) {
                    const input = document.getElementById('value_' + file);
                    const checkbox = document.getElementById(file);
                    if (!input.value) {
                        checkbox.checked = false;
                        input.style.display = 'none';
                    }
                }

                function handleCheckboxKeydown(event, file) {
                    if (event.key === 'Tab') {
                        event.preventDefault();
                        const input = document.getElementById('value_' + file);
                        const checkbox = document.getElementById(file);
                        if (checkbox.checked) {
                            input.focus();
                        } else {
                            checkbox.checked = true;
                            input.style.display = 'inline';
                            input.focus();
                        }
                    }
                }

                function handleInputKeydown(event, file) {
                    if (event.key === 'Tab') {
                        const input = document.getElementById('value_' + file);
                        const checkbox = document.getElementById(file);
                        if (!input.value) {
                            checkbox.checked = false;
                            input.style.display = 'none';
                        }
                    }
                }

                document.addEventListener('keydown', function(event) {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        document.getElementById('AddBtn').click();
                    }
                });

                function addLabel() {
                    const label = document.getElementById('labelName').value;
                    const files = Array.from(document.querySelectorAll('input[name="files"]:checked')).map(checkbox => ({
                        file: checkbox.value,
                        value: document.getElementById('value_' + checkbox.value).value
                    }));
                    const runScript = document.getElementById('runScript').checked;

                    if (!label || files.some(file => !file.value)) {
                        vscode.postMessage({
                            command: 'showError',
                            message: 'The label name and value cannot be null.'
                        });
                        return;
                    }

                    vscode.postMessage({
                        command: 'addLabel',
                        label,
                        files,
                        directory: "${directory.replace(/\\/g, '\\\\')}",
                        runScript
                    });
                }
            </script>
        </body>
        </html>
    `;
}

async function runSelectedScript(context: vscode.ExtensionContext) {
    const scriptPath = context.globalState.get<string>('selectedScript');
    if (!scriptPath) {
        vscode.window.showErrorMessage('No script selected.');
        return;
    }
    
    const terminal = vscode.window.createTerminal('Run Script');
    terminal.show();
    terminal.sendText(`${scriptPath}`);
}
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const xml2js_1 = require("xml2js");
const RECENT_DIRECTORIES_KEY = 'recentDirectories';
function activate(context) {
    console.log('Congratulations, your extension "autoLabel" is now active!');
    const disposable = vscode.commands.registerCommand('autoLabel.addLabel', async () => {
        const recentDirectories = context.globalState.get(RECENT_DIRECTORIES_KEY, []);
        const lastDirectory = recentDirectories.length > 0 ? recentDirectories[0] : null;
        const panel = vscode.window.createWebviewPanel('autoLabel', 'BaNaNaLabel', vscode.ViewColumn.One, {
            enableScripts: true,
        });
        panel.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'media', 'icon.png'));
        if (lastDirectory && fs.existsSync(lastDirectory)) {
            const files = fs.readdirSync(lastDirectory).filter(file => file.endsWith('.json') || file.endsWith('.xml'));
            panel.webview.html = getWebviewContent(lastDirectory, files, recentDirectories);
        }
        else {
            panel.webview.html = getInitialWebviewContent(recentDirectories);
        }
        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'selectDirectory') {
                const selectedFolder = await vscode.window.showOpenDialog({
                    canSelectFolders: true,
                    canSelectFiles: false,
                    canSelectMany: false
                });
                if (selectedFolder && selectedFolder.length > 0) {
                    const selectedDir = selectedFolder[0].fsPath;
                    const files = fs.readdirSync(selectedDir).filter(file => file.endsWith('.json') || file.endsWith('.xml'));
                    // Update recent directories
                    const updatedRecentDirectories = [selectedDir, ...recentDirectories.filter(dir => dir !== selectedDir)].slice(0, 5);
                    await context.globalState.update(RECENT_DIRECTORIES_KEY, updatedRecentDirectories);
                    panel.webview.html = getWebviewContent(selectedDir, files, updatedRecentDirectories);
                }
            }
            else if (message.command === 'addLabel') {
                const { label, files, directory } = message;
                if (!label || files.some((file) => !file.value)) {
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
                        let xmlContent;
                        if (file.endsWith('.json')) {
                            let jsonContent = {};
                            if (fileContent) {
                                jsonContent = JSON.parse(fileContent);
                            }
                            if (jsonContent.hasOwnProperty(label)) {
                                vscode.window.showErrorMessage(`Label "${label}" already exists in file "${absoluteFilePath}" with value "${jsonContent[label]}".`);
                                continue;
                            }
                            jsonContent[label] = value;
                            fs.writeFileSync(absoluteFilePath, JSON.stringify(jsonContent, null, 2), 'utf8');
                        }
                        else if (file.endsWith('.xml')) {
                            if (fileContent) {
                                xmlContent = await (0, xml2js_1.parseStringPromise)(fileContent);
                            }
                            else {
                                xmlContent = { root: { data: [] } };
                            }
                            if (!xmlContent.root) {
                                xmlContent.root = { data: [] };
                            }
                            if (!xmlContent.root.data) {
                                xmlContent.root.data = [];
                            }
                            const existingLabel = xmlContent.root.data.find((item) => item.$.name === label);
                            if (existingLabel) {
                                vscode.window.showErrorMessage(`Label "${label}" already exists in file "${absoluteFilePath}" with value "${existingLabel.value}".`);
                                continue;
                            }
                            xmlContent.root.data.push({
                                $: { name: label },
                                value: value
                            });
                            const builder = new xml2js_1.Builder({ headless: false, renderOpts: { pretty: true, indent: '  ', newline: '\n' } });
                            const newXmlContent = builder.buildObject(xmlContent);
                            fs.writeFileSync(absoluteFilePath, newXmlContent, 'utf8');
                        }
                    }
                    catch (error) {
                        if (error instanceof Error) {
                            vscode.window.showErrorMessage(`Error processing file "${absoluteFilePath}": ${error.message}`);
                        }
                    }
                }
                vscode.window.showInformationMessage(`Label "${label}" added to selected files.`);
            }
        });
    });
    context.subscriptions.push(disposable);
}
function deactivate() { }
function getInitialWebviewContent(recentDirectories) {
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
			font-size: 16px;
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
			font-size: 36px;
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
							command: 'selectDirectory',
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
function getWebviewContent(directory, files, recentDirectories) {
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
			font-size: 16px;
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
			font-size: 36px;
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
							command: 'selectDirectory',
							directory: directory
						});
					}
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
						directory: "${directory.replace(/\\/g, '\\\\')}"
					});
				}
			</script>
		</body>
		</html>
	`;
}
//# sourceMappingURL=extension.js.map
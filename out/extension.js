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
function activate(context) {
    console.log('Congratulations, your extension "autoLabel" is now active!');
    const disposable = vscode.commands.registerCommand('autoLabel.addLabel', async () => {
        const panel = vscode.window.createWebviewPanel('autoLabel', 'Auto Label', vscode.ViewColumn.One, {
            enableScripts: true
        });
        panel.webview.html = getInitialWebviewContent();
        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'selectDirectory') {
                const selectedFolder = await vscode.window.showOpenDialog({
                    canSelectFolders: true,
                    canSelectFiles: false,
                    canSelectMany: false
                });
                if (selectedFolder && selectedFolder.length > 0) {
                    const selectedDir = selectedFolder[0].fsPath;
                    const jsonFiles = fs.readdirSync(selectedDir).filter(file => file.endsWith('.json'));
                    panel.webview.html = getWebviewContent(selectedDir, jsonFiles);
                }
            }
            else if (message.command === 'addLabel') {
                const { label, files, directory } = message;
                for (const { file, value } of files) {
                    const absoluteFilePath = path.join(directory, file);
                    if (!fs.existsSync(absoluteFilePath)) {
                        vscode.window.showErrorMessage(`File "${absoluteFilePath}" does not exist.`);
                        continue;
                    }
                    try {
                        const fileContent = fs.readFileSync(absoluteFilePath, 'utf8');
                        let jsonContent = {};
                        if (fileContent.trim()) {
                            jsonContent = JSON.parse(fileContent);
                        }
                        jsonContent[label] = value;
                        fs.writeFileSync(absoluteFilePath, JSON.stringify(jsonContent, null, 4), 'utf8');
                    }
                    catch (error) {
                        vscode.window.showErrorMessage(`Error processing file "${absoluteFilePath}": ${error.message}`);
                    }
                }
                vscode.window.showInformationMessage(`Label "${label}" added to selected files.`);
            }
        });
    });
    context.subscriptions.push(disposable);
}
function deactivate() { }
function getInitialWebviewContent() {
    return `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Auto Label</title>
		</head>
		<body>
			<h1>Auto Label</h1>
			<button onclick="selectDirectory()">Seleziona Directory</button>
			<script>
				const vscode = acquireVsCodeApi();

				function selectDirectory() {
					vscode.postMessage({
						command: 'selectDirectory'
					});
				}
			</script>
		</body>
		</html>
	`;
}
function getWebviewContent(directory, jsonFiles) {
    const fileCheckboxes = jsonFiles.map(file => `
		<input type="checkbox" id="${file}" name="jsonFiles" value="${file}" onchange="toggleInput('${file}')">
		<label for="${file}">${file}</label>
		<input type="text" id="value_${file}" name="value_${file}" placeholder="Valore Label" style="display:none;"><br>
	`).join('');
    return `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Auto Label</title>
		</head>
		<body>
			<h1>Auto Label</h1>
			<p>Directory selezionata: ${directory}</p>
			<form id="labelForm">
				<label for="labelName">Nome Label:</label>
				<input type="text" id="labelName" name="labelName"><br><br>
				<label for="jsonFiles">File .json influenzati:</label><br>
				${fileCheckboxes}
				<button type="button" onclick="addLabel()">Aggiungi Label</button>
			</form>
			<script>
				const vscode = acquireVsCodeApi();

				function toggleInput(file) {
					const input = document.getElementById('value_' + file);
					input.style.display = input.style.display === 'none' ? 'inline' : 'none';
				}

				function addLabel() {
					const label = document.getElementById('labelName').value;
					const files = Array.from(document.querySelectorAll('input[name="jsonFiles"]:checked')).map(checkbox => ({
						file: checkbox.value,
						value: document.getElementById('value_' + checkbox.value).value
					}));

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
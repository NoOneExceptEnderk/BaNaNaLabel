import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { parseStringPromise, Builder } from 'xml2js';

const RECENT_DIRECTORIES_KEY = 'recentDirectories';

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "autoLabel" is now active!');

	const disposable = vscode.commands.registerCommand('autoLabel.addLabel', async () => {
		const recentDirectories = context.globalState.get<string[]>(RECENT_DIRECTORIES_KEY, []);
		const lastDirectory = recentDirectories.length > 0 ? recentDirectories[0] : null;

		const panel = vscode.window.createWebviewPanel(
			'autoLabel',
			'Auto Label',
			vscode.ViewColumn.One,
			{
				enableScripts: true
			}
		);

		if (lastDirectory && fs.existsSync(lastDirectory)) {
			const files = fs.readdirSync(lastDirectory).filter(file => file.endsWith('.json') || file.endsWith('.xml'));
			panel.webview.html = getWebviewContent(lastDirectory, files, recentDirectories);
		} else {
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
			} else if (message.command === 'addLabel') {
				const { label, files, directory } = message;

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
							let jsonContent: { [key: string]: any } = {};
							if (fileContent) {
								jsonContent = JSON.parse(fileContent);
							}
							jsonContent[label] = value;
							fs.writeFileSync(absoluteFilePath, JSON.stringify(jsonContent, null, 2), 'utf8');
						} else if (file.endsWith('.xml')) {
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
							xmlContent.root.data.push({
								$: { name: label },
								value: value
							});
							const builder = new Builder({ headless: true, renderOpts: { pretty: true, indent: '  ', newline: '\n' } });
							const newXmlContent = builder.buildObject(xmlContent);
							fs.writeFileSync(absoluteFilePath, newXmlContent, 'utf8');
						}
					} catch (error) {
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

export function deactivate() {}

function getInitialWebviewContent(recentDirectories: string[]) {
	const recentDirsOptions = recentDirectories.map(dir => `<option value="${dir}">${dir}</option>`).join('');

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
			<select id="recentDirectories" onchange="selectRecentDirectory()">
				<option value="">Seleziona una directory recente</option>
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
			</script>
		</body>
		</html>
	`;
}

function getWebviewContent(directory: string, files: string[], recentDirectories: string[]) {
	const fileCheckboxes = files.map(file => `
		<input type="checkbox" id="${file}" name="files" value="${file}" onchange="toggleInput('${file}')">
		<label for="${file}">${file}</label>
		<input type="text" id="value_${file}" name="value_${file}" placeholder="Valore Label" style="display:none;"><br>
	`).join('');

	const recentDirsOptions = recentDirectories.map(dir => `<option value="${dir}">${dir}</option>`).join('');

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
			<button onclick="selectDirectory()">Cambia Directory</button>
			<select id="recentDirectories" onchange="selectRecentDirectory()">
				<option value="">Seleziona una directory recente</option>
				${recentDirsOptions}
			</select>
			<form id="labelForm">
				<label for="labelName">Nome Label:</label>
				<input type="text" id="labelName" name="labelName"><br><br>
				<label for="files">File influenzati:</label><br>
				${fileCheckboxes}
				<button type="button" onclick="addLabel()">Aggiungi Label</button>
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
				}

				function addLabel() {
					const label = document.getElementById('labelName').value;
					const files = Array.from(document.querySelectorAll('input[name="files"]:checked')).map(checkbox => ({
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
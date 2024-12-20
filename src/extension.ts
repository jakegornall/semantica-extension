import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { SemanticChunk, SemanticFile } from './types';

export function activate(context: vscode.ExtensionContext) {
	const provider = new SemanticExplorerProvider(context.extensionUri);
	
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('semanticExplorer', provider)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('semantica-extension.deleteChunk', async (params) => {
			console.log('Delete command received with params:', params);  // Debug log
			if (params && typeof params.chunkIndex === 'number' && params.version) {
				await provider.deleteChunk(params.chunkIndex, params.version);
			} else {
				console.error('Invalid parameters for deleteChunk:', params);
			}
		}),
		vscode.commands.registerCommand('semantica-extension.updateChunk', 
			(chunkIndex: number, version: string, updatedChunk: any) => {
			provider.updateChunk(chunkIndex, version, updatedChunk);
		})
	);
}

class SemanticExplorerProvider implements vscode.WebviewViewProvider {
	private _view?: vscode.WebviewView;
	private _extensionUri: vscode.Uri;
	private _semanticFiles: Map<string, SemanticFile> = new Map();

	constructor(extensionUri: vscode.Uri) {
		this._extensionUri = extensionUri;
	}

	public resolveWebviewView(
			webviewView: vscode.WebviewView,
			context: vscode.WebviewViewResolveContext,
			_token: vscode.CancellationToken,
	) {
		this._view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
		this._setWebviewMessageListener(webviewView.webview);
	}

	private async _getSemanticVersions(): Promise<string[]> {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
		if (!workspaceRoot) return [];

		const semanticDir = path.join(workspaceRoot, '.semantic');
		if (!fs.existsSync(semanticDir)) return [];

		const files = fs.readdirSync(semanticDir);
		return files
			.filter(file => file.endsWith('-chunks.yaml'))
			.map(file => file.replace('-chunks.yaml', ''));
	}

	private async _loadSemanticFile(version: string): Promise<SemanticFile | null> {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
		if (!workspaceRoot) return null;

		const filePath = path.join(workspaceRoot, '.semantic', `${version}-chunks.yaml`);
		if (!fs.existsSync(filePath)) return null;

		try {
			const fileContent = fs.readFileSync(filePath, 'utf8');
			const semanticFile = yaml.load(fileContent) as SemanticFile;
			
			// Ensure all chunks have the approved field
			semanticFile.chunks = semanticFile.chunks.map(chunk => ({
				...chunk,
				approved: chunk.approved ?? false
			}));
			
			return semanticFile;
		} catch (error) {
			console.error(`Error loading semantic file: ${error}`);
			return null;
		}
	}

	public async deleteChunk(chunkIndex: number, version: string) {
		console.log(`Attempting to delete chunk ${chunkIndex} from version ${version}`);
		const semanticFile = await this._loadSemanticFile(version);
		if (!semanticFile) {
			console.error('Could not load semantic file');
			return;
		}

		semanticFile.chunks.splice(chunkIndex, 1);
		semanticFile.metadata.chunk_count = semanticFile.chunks.length;

		await this._saveSemanticFile(version, semanticFile);
		console.log('Chunk deleted successfully');
		
		this._view?.webview.postMessage({ 
			command: 'refreshChunks',
			version,
			chunks: semanticFile.chunks
		});
	}

	public async updateChunk(chunkIndex: number, version: string, updatedChunk: SemanticChunk) {
		console.log('Updating chunk:', { chunkIndex, version, updatedChunk }); // Debug log
		const semanticFile = await this._loadSemanticFile(version);
		if (!semanticFile) {
			console.error('Could not load semantic file for version:', version);
			return;
		}

		semanticFile.chunks[chunkIndex] = updatedChunk;
		await this._saveSemanticFile(version, semanticFile);
		console.log('Chunk updated successfully'); // Debug log
		this._view?.webview.postMessage({ 
			command: 'refreshChunks',
			version,
			chunks: semanticFile.chunks
		});
	}

	private async _saveSemanticFile(version: string, semanticFile: SemanticFile) {
		const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
		if (!workspaceRoot) {
			console.error('No workspace root found');
			return;
		}

		const filePath = path.join(workspaceRoot, '.semantic', `${version}-chunks.yaml`);
		console.log('Saving to file:', filePath); // Debug log
		try {
			const yamlContent = yaml.dump(semanticFile, { 
				indent: 2,
				lineWidth: -1
			});
			fs.writeFileSync(filePath, yamlContent, 'utf8');
			console.log('File saved successfully'); // Debug log
		} catch (error) {
			console.error('Error saving file:', error);
		}
	}

	private _setWebviewMessageListener(webview: vscode.Webview) {
		webview.onDidReceiveMessage(async (message) => {
			console.log('Received message in extension:', message);  // Debug log
			switch (message.command) {
				case 'deleteChunk':
					console.log('Processing delete command:', message.params);
					await this.deleteChunk(message.params.chunkIndex, message.params.version);
					break;

				case 'semantica-extension.updateChunk':
					console.log('Processing update command:', message);
					await this.updateChunk(message.chunkIndex, message.version, message.chunk);
					break;

				case 'getVersions':
					const versions = await this._getSemanticVersions();
						webview.postMessage({ command: 'versions', data: versions });
					break;
				case 'getChunks':
					var semanticFile = await this._loadSemanticFile(message.version);
					if (semanticFile) {
						webview.postMessage({ 
							command: 'chunks',
							version: message.version,
							data: semanticFile.chunks
						});
					}
					break;
				case 'getReasoning':
					var semanticFile = await this._loadSemanticFile(message.version);
					if (semanticFile) {
						webview.postMessage({ 
							command: 'reasoning',
							version: message.version,
							data: semanticFile.reasoning_and_planning || []
						});
					}
					break;

				case 'updateReasoning':
					await this.updateReasoning(message.version, message.reasoning);
					break;
			}
		});
	}

	private _getHtmlForWebview(webview: vscode.Webview): string {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js')
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css')
		);

		return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<link href="${styleUri}" rel="stylesheet">
			<title>Semantic Explorer</title>
		</head>
		<body>
			<div id="versions-container">
				<div id="version-tabs"></div>
			</div>
			<div id="view-tabs"></div>
			<div id="chunks-container"></div>
			<div id="reasoning-container"></div>
			<script src="${scriptUri}"></script>
		</body>
		</html>`;
	}

	public async updateReasoning(version: string, reasoning: string[]) {
		const semanticFile = await this._loadSemanticFile(version);
		if (!semanticFile) return;

		semanticFile.reasoning_and_planning = reasoning;
		await this._saveSemanticFile(version, semanticFile);
		
		this._view?.webview.postMessage({ 
			command: 'reasoning',
			version,
			data: reasoning
		});
	}
}

export function deactivate() {}

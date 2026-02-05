import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    // 1. THE AUTO-PIN LISTENER (Existing)
    const pinListener = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
        if (editor && editor.document.uri.scheme === 'isfs') {
            await vscode.commands.executeCommand('workbench.action.keepEditor');
            setTimeout(async () => {
                if (vscode.window.activeTextEditor === editor) {
                    await vscode.commands.executeCommand('workbench.action.keepEditor');
                }
            }, 150);
        }
    });

    // 2. THE SHORTCUT COMMAND (New)
    let shortcutDisposable = vscode.commands.registerCommand('intersystems-utils.targetedOpen', async () => {
        try {
            // This calls the native InterSystems search portal
            await vscode.commands.executeCommand('intersystems.portals.openFile');
        } catch (error) {
            // Fallback in case the command ID is slightly different in your version
            await vscode.commands.executeCommand('intersystems.search');
        }
    });

    context.subscriptions.push(pinListener, shortcutDisposable);
}

export function deactivate() {}
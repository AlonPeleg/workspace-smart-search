import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    // THE AUTO-PIN LISTENER
    const pinListener = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
        if (editor && editor.document.uri.scheme === 'isfs') {
            // 1. First attempt to pin immediately
            await vscode.commands.executeCommand('workbench.action.keepEditor');

            // 2. Second attempt after a tiny delay 
            // This catches the tab if the server-load "refreshes" it
            setTimeout(async () => {
                // We check again if the editor is still the same one
                if (vscode.window.activeTextEditor === editor) {
                    await vscode.commands.executeCommand('workbench.action.keepEditor');
                }
            }, 150);
        }
    });

    context.subscriptions.push(pinListener);
}

export function deactivate() {}
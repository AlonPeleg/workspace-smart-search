import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    // THE AUTO-PIN LISTENER (Baseline)
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

    // THE SMART GO-TO FUNCTION
    let smartJump = vscode.commands.registerCommand('workspace-smart-search.directGoTo', async () => {
        const folders = vscode.workspace.workspaceFolders?.filter(f => f.uri.scheme === 'isfs');

        if (!folders || folders.length === 0) {
            vscode.window.showErrorMessage("No InterSystems (isfs) folders found in workspace.");
            return;
        }

        // 1. If more than one folder, ask the user to choose
        let selectedFolder = folders[0];
        if (folders.length > 1) {
            const picks = folders.map(f => ({
                label: f.name,
                description: f.uri.authority,
                folder: f
            }));
            const selection = await vscode.window.showQuickPick(picks, {
                placeHolder: "Select the server to search in:"
            });
            if (!selection) return;
            selectedFolder = selection.folder;
        }

        // 2. Ask for the Target
        const input = await vscode.window.showInputBox({
            prompt: `Search in ${selectedFolder.name} (e.g., Label+Offset^Routine)`,
            placeHolder: "WEBSCR+12^WBLRSHOWFF"
        });

        if (!input) return;

        // 3. Parse Input
        let label = "";
        let offset = 0;
        let routine = "";
        if (input.includes('^')) {
            const parts = input.split('^');
            routine = parts[1];
            const labelPart = parts[0];
            if (labelPart.includes('+')) {
                label = labelPart.split('+')[0];
                offset = parseInt(labelPart.split('+')[1]) || 0;
            } else {
                label = labelPart;
            }
        } else {
            routine = input;
        }

        // 4. Try to open the file (.mac then .int)
        const extensions = ['.mac', '.int'];
        let doc: vscode.TextDocument | undefined;

        for (const ext of extensions) {
            try {
                const fullRoutine = routine.includes('.') ? routine : `${routine}${ext}`;
                const uri = vscode.Uri.parse(`isfs://${selectedFolder.uri.authority}/${fullRoutine}`);
                doc = await vscode.workspace.openTextDocument(uri);
                if (doc) break;
            } catch (e) { /* continue */ }
        }

        if (!doc) {
            vscode.window.showErrorMessage(`Could not find routine: ${routine} on ${selectedFolder.name}`);
            return;
        }

        // 5. Navigate to Label and Offset
        const editor = await vscode.window.showTextDocument(doc);
        if (label) {
            const text = doc.getText();
            const lines = text.split(/\r?\n/);
            let labelLineIndex = lines.findIndex(line => line.startsWith(label));

            if (labelLineIndex !== -1) {
                const finalLine = labelLineIndex + offset;
                const position = new vscode.Position(finalLine, 0);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
            }
        }
    });
    context.subscriptions.push(pinListener, smartJump);
}

export function deactivate() {}
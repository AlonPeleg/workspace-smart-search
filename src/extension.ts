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
            vscode.window.showErrorMessage("No InterSystems (isfs) folders found.");
            return;
        }

        // 1. Select Server
        let selectedFolder = folders[0];
        if (folders.length > 1) {
            const picks = folders.map(f => ({
                label: f.name,
                description: f.uri.authority,
                folder: f
            }));
            const selection = await vscode.window.showQuickPick(picks, { placeHolder: "Select Server:" });
            if (!selection) return;
            selectedFolder = selection.folder;
        }

        // 2. Input
        const input = await vscode.window.showInputBox({
            prompt: "Routine^Label or Class.Name",
            placeHolder: "DOC.Leasing.TIK.Klali or WEBSCR^WBLRSHOWFF"
        });

        if (!input) return;

        let rawName = "";
        let searchTrigger = "";

        // 3. Split Label/Method from Name
        if (input.includes('^')) {
            const parts = input.split('^');
            rawName = parts[1];
            searchTrigger = parts[0].split('+')[0]; 
        } else if (input.includes('#')) {
            const parts = input.split('#');
            rawName = parts[0];
            searchTrigger = parts[1];
        } else {
            rawName = input;
        }

        // 4. THE FIX: Convert Class Dots to Slashes
        // If it looks like a class (has dots and doesn't end in .mac/.int)
        let isClass = rawName.includes('.') && !rawName.toLowerCase().endsWith('.mac') && !rawName.toLowerCase().endsWith('.int');
        let formattedPath = isClass ? rawName.replace(/\./g, '/') : rawName;

        const extensions = isClass ? ['.cls', '.mac', '.int'] : ['.mac', '.int', '.cls'];
        
        let doc: vscode.TextDocument | undefined;
        for (const ext of extensions) {
            try {
                const finalPath = formattedPath.endsWith(ext) ? formattedPath : `${formattedPath}${ext}`;
                const uri = vscode.Uri.parse(`isfs://${selectedFolder.uri.authority}/${finalPath}`);
                doc = await vscode.workspace.openTextDocument(uri);
                if (doc) break;
            } catch (e) { /* next */ }
        }

        if (!doc) {
            vscode.window.showErrorMessage(`Not found: ${rawName} (Tried: ${formattedPath})`);
            return;
        }

        // 5. Navigate
        const editor = await vscode.window.showTextDocument(doc);
        if (searchTrigger) {
            const text = doc.getText();
            const lines = text.split(/\r?\n/);
            
            // Matches 'Label' at start of line OR 'Method Name' or 'ClassMethod Name'
            const regex = new RegExp(`^${searchTrigger}\\b|Method\\s+${searchTrigger}\\b`, 'i');
            let lineIndex = lines.findIndex(line => regex.test(line));

            if (lineIndex !== -1) {
                const position = new vscode.Position(lineIndex, 0);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
            }
        }
    });
    context.subscriptions.push(pinListener, smartJump);
}

export function deactivate() {}
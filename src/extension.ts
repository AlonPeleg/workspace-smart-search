import * as vscode from 'vscode';

// Decoration for the bookmark icon in the gutter
const bookmarkDecorationType = vscode.window.createTextEditorDecorationType({
    gutterIconPath: vscode.Uri.parse('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDE2IDE2Ij48cGF0aCBmaWxsPSIjRkZEMDREIiBkPSJNMyAySDEzVjE0TDEwIDExTDcgMTRWMloiLz48L3N2Zz4='),
    gutterIconSize: 'contain',
    overviewRulerColor: 'rgba(255, 208, 77, 0.8)',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
});

export function activate(context: vscode.ExtensionContext) {
    // --- BOOKMARK STATE MANAGEMENT ---
    let bookmarks: { [uri: string]: number[] } = context.workspaceState.get('isfsBookmarks', {});

    const updateDecorations = (editor: vscode.TextEditor | undefined) => {
        if (!editor || editor.document.uri.scheme !== 'isfs') return;
        const uri = editor.document.uri.toString();
        const lines = bookmarks[uri] || [];
        editor.setDecorations(bookmarkDecorationType, lines.map(line => ({ 
            range: new vscode.Range(line, 0, line, 0) 
        })));
    };

    // --- THE AUTO-PIN LISTENER ---
    const pinListener = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
        if (editor && editor.document.uri.scheme === 'isfs') {
            updateDecorations(editor);
            await vscode.commands.executeCommand('workbench.action.keepEditor');
            setTimeout(async () => {
                if (vscode.window.activeTextEditor === editor) {
                    await vscode.commands.executeCommand('workbench.action.keepEditor');
                }
            }, 150);
        }
    });

    // --- FEATURE: TOGGLE BOOKMARK (Ctrl+F2) ---
    let toggleBookmark = vscode.commands.registerCommand('workspace-smart-search.toggleBookmark', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.scheme !== 'isfs') return;

        const uri = editor.document.uri.toString();
        const line = editor.selection.active.line;
        
        if (!bookmarks[uri]) bookmarks[uri] = [];
        const index = bookmarks[uri].indexOf(line);
        
        if (index > -1) {
            bookmarks[uri].splice(index, 1);
        } else {
            bookmarks[uri].push(line);
        }

        await context.workspaceState.update('isfsBookmarks', bookmarks);
        updateDecorations(editor);
    });

    // --- FEATURE: NEXT BOOKMARK (F2) ---
    let jumpBookmark = vscode.commands.registerCommand('workspace-smart-search.jumpBookmark', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.scheme !== 'isfs') return;

        const uri = editor.document.uri.toString();
        const currentLine = editor.selection.active.line;
        const fileBookmarks = (bookmarks[uri] || []).sort((a, b) => a - b);

        if (fileBookmarks.length === 0) return;

        const next = fileBookmarks.find(l => l > currentLine) ?? fileBookmarks[0];
        const pos = new vscode.Position(next, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    });

    // --- FEATURE: CLEAR ALL BOOKMARKS (Ctrl+Alt+F2) ---
    let clearBookmarks = vscode.commands.registerCommand('workspace-smart-search.clearBookmarks', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.scheme !== 'isfs') return;

        const uri = editor.document.uri.toString();
        if (bookmarks[uri]) {
            delete bookmarks[uri];
            await context.workspaceState.update('isfsBookmarks', bookmarks);
            updateDecorations(editor);
            vscode.window.setStatusBarMessage("Bookmarks cleared for this file", 2000);
        }
    });

    // --- THE SMART GO-TO FUNCTION (Ctrl+Alt+G) ---
    let smartJump = vscode.commands.registerCommand('workspace-smart-search.directGoTo', async () => {
        const folders = vscode.workspace.workspaceFolders?.filter(f => f.uri.scheme === 'isfs');

        if (!folders || folders.length === 0) {
            vscode.window.showErrorMessage("No InterSystems (isfs) folders found.");
            return;
        }

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

        const input = await vscode.window.showInputBox({
            prompt: "Routine^Label or Class.Name",
            placeHolder: "DOC.Leasing.TIK.Klali or WEBSCR^WBLRSHOWFF"
        });

        if (!input) return;

        let rawName = "";
        let searchTrigger = "";
        let lineOffset = 0;

        if (input.includes('^')) {
            const parts = input.split('^');
            rawName = parts[1];
            const labelPart = parts[0];
            if (labelPart.includes('+')) {
                const offsetParts = labelPart.split('+');
                searchTrigger = offsetParts[0];
                lineOffset = parseInt(offsetParts[1]) || 0;
            } else {
                searchTrigger = labelPart;
            }
        } else if (input.includes('#')) {
            const parts = input.split('#');
            rawName = parts[0];
            const methodPart = parts[1];
            if (methodPart.includes('+')) {
                const offsetParts = methodPart.split('+');
                searchTrigger = offsetParts[0];
                lineOffset = parseInt(offsetParts[1]) || 0;
            } else {
                searchTrigger = methodPart;
            }
        } else {
            rawName = input;
        }

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
            } catch (e) { }
        }

        if (!doc) {
            vscode.window.showErrorMessage(`Not found: ${rawName}`);
            return;
        }

        const editor = await vscode.window.showTextDocument(doc);
        if (searchTrigger) {
            const text = doc.getText();
            const lines = text.split(/\r?\n/);
            const regex = new RegExp(`^${searchTrigger}\\b|Method\\s+${searchTrigger}\\b`, 'i');
            let lineIndex = lines.findIndex(line => regex.test(line));

            if (lineIndex !== -1) {
                const finalLine = lineIndex + lineOffset;
                const position = new vscode.Position(finalLine, 0);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
            }
        }
    });

    context.subscriptions.push(pinListener, smartJump, toggleBookmark, jumpBookmark, clearBookmarks);
}

export function deactivate() {}
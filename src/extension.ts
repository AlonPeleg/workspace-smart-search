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
        bookmarkProvider.refresh();
    };

    // --- SIDEBAR TREE VIEW PROVIDER ---
    class BookmarkProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
        private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
        readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

        refresh(): void { this._onDidChangeTreeData.fire(); }

        getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

        async getChildren(element?: FileItem): Promise<vscode.TreeItem[]> {
            // If no element, return the list of Files (Folders)
            if (!element) {
                const uris = Object.keys(bookmarks).filter(uri => bookmarks[uri].length > 0);
                return uris.map(uri => new FileItem(uri, bookmarks[uri].length));
            }

            // If element is a FileItem, return its bookmarks
            const uriString = element.uri.toString();
            const fileBookmarks = (bookmarks[uriString] || []).sort((a, b) => a - b);
            
            try {
                const doc = await vscode.workspace.openTextDocument(element.uri);
                const textLines = doc.getText().split(/\r?\n/);

                return fileBookmarks.map(line => {
                    let labelName = `Line ${line + 1}`;
                    for (let i = line; i >= 0; i--) {
                        const lineText = textLines[i];
                        const match = lineText.match(/^([%A-Za-z0-9]+)\b/) || lineText.match(/Method\s+([%A-Za-z0-9]+)/i);
                        if (match) {
                            const offset = line - i;
                            labelName = offset === 0 ? match[1] : `${match[1]}+${offset}`;
                            break;
                        }
                    }
                    return new BookmarkItem(labelName, line, element.uri);
                });
            } catch (e) {
                return [];
            }
        }
    }

    class FileItem extends vscode.TreeItem {
        public readonly uri: vscode.Uri;
        constructor(uriString: string, count: number) {
            const uri = vscode.Uri.parse(uriString);
            // Display: Namespace - Filename (e.g., pery-test:ACC - WBLRSHOWFF.int)
            const label = `${uri.authority} - ${uri.path.split('/').pop()}`;
            super(label, vscode.TreeItemCollapsibleState.Expanded);
            this.uri = uri;
            this.iconPath = vscode.ThemeIcon.Folder;
            this.description = `${count} bookmarks`;
            this.contextValue = 'fileItem'; // For the Clear All button
        }
    }

    class BookmarkItem extends vscode.TreeItem {
        constructor(label: string, public readonly line: number, public readonly uri: vscode.Uri) {
            super(label, vscode.TreeItemCollapsibleState.None);
            this.description = `line ${line + 1}`;
            this.iconPath = new vscode.ThemeIcon('bookmark');
            this.contextValue = 'bookmarkItem';
            this.command = {
                command: 'workspace-smart-search.jumpToSpecific',
                title: 'Jump',
                arguments: [this]
            };
        }
    }

    const bookmarkProvider = new BookmarkProvider();
    vscode.window.registerTreeDataProvider('isfsBookmarksView', bookmarkProvider);

    // --- AUTO-PIN LISTENER ---
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

    // --- COMMANDS ---

    vscode.commands.registerCommand('workspace-smart-search.jumpToSpecific', async (item: BookmarkItem) => {
        const doc = await vscode.workspace.openTextDocument(item.uri);
        const editor = await vscode.window.showTextDocument(doc);
        const pos = new vscode.Position(item.line, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    });

    vscode.commands.registerCommand('workspace-smart-search.deleteSingleBookmark', async (item: BookmarkItem) => {
        const uri = item.uri.toString();
        if (bookmarks[uri]) {
            bookmarks[uri] = bookmarks[uri].filter(l => l !== item.line);
            await context.workspaceState.update('isfsBookmarks', bookmarks);
            updateDecorations(vscode.window.activeTextEditor);
        }
    });

    // New Command: Clear bookmarks for a specific file from the sidebar
    vscode.commands.registerCommand('workspace-smart-search.clearFileBookmarks', async (item: FileItem) => {
        const uri = item.uri.toString();
        delete bookmarks[uri];
        await context.workspaceState.update('isfsBookmarks', bookmarks);
        updateDecorations(vscode.window.activeTextEditor);
    });

    let toggleBookmark = vscode.commands.registerCommand('workspace-smart-search.toggleBookmark', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.scheme !== 'isfs') return;
        const uri = editor.document.uri.toString();
        const line = editor.selection.active.line;
        if (!bookmarks[uri]) bookmarks[uri] = [];
        const idx = bookmarks[uri].indexOf(line);
        idx > -1 ? bookmarks[uri].splice(idx, 1) : bookmarks[uri].push(line);
        await context.workspaceState.update('isfsBookmarks', bookmarks);
        updateDecorations(editor);
    });

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

    let clearBookmarks = vscode.commands.registerCommand('workspace-smart-search.clearBookmarks', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.uri.scheme === 'isfs') {
            delete bookmarks[editor.document.uri.toString()];
            await context.workspaceState.update('isfsBookmarks', bookmarks);
            updateDecorations(editor);
        }
    });

    let smartJump = vscode.commands.registerCommand('workspace-smart-search.directGoTo', async () => {
        const folders = vscode.workspace.workspaceFolders?.filter(f => f.uri.scheme === 'isfs');
        if (!folders || folders.length === 0) return;
        let selectedFolder = folders[0];
        if (folders.length > 1) {
            const picks = folders.map(f => ({ label: f.name, description: f.uri.authority, folder: f }));
            const selection = await vscode.window.showQuickPick(picks, { placeHolder: "Select Server:" });
            if (!selection) return;
            selectedFolder = selection.folder;
        }
        const input = await vscode.window.showInputBox({ prompt: "Routine^Label or Class.Name" });
        if (!input) return;
        let rawName = "", searchTrigger = "", lineOffset = 0;
        if (input.includes('^')) {
            const parts = input.split('^');
            rawName = parts[1];
            const lab = parts[0];
            if (lab.includes('+')) {
                const off = lab.split('+');
                searchTrigger = off[0];
                lineOffset = parseInt(off[1]) || 0;
            } else { searchTrigger = lab; }
        } else if (input.includes('#')) {
            const parts = input.split('#');
            rawName = parts[0];
            const methodPart = parts[1];
            if (methodPart.includes('+')) {
                const off = methodPart.split('+');
                searchTrigger = off[0];
                lineOffset = parseInt(off[1]) || 0;
            } else { searchTrigger = methodPart; }
        } else { rawName = input; }
        let isClass = rawName.includes('.') && !rawName.toLowerCase().endsWith('.mac') && !rawName.toLowerCase().endsWith('.int');
        let formattedPath = isClass ? rawName.replace(/\./g, '/') : rawName;
        const extensions = isClass ? ['.cls', '.mac', '.int'] : ['.mac', '.int', '.cls'];
        for (const ext of extensions) {
            try {
                const finalPath = formattedPath.endsWith(ext) ? formattedPath : `${formattedPath}${ext}`;
                const uri = vscode.Uri.parse(`isfs://${selectedFolder.uri.authority}/${finalPath}`);
                const doc = await vscode.workspace.openTextDocument(uri);
                const editor = await vscode.window.showTextDocument(doc);
                if (searchTrigger) {
                    const lines = doc.getText().split(/\r?\n/);
                    const regex = new RegExp(`^${searchTrigger}\\b|Method\\s+${searchTrigger}\\b`, 'i');
                    let idx = lines.findIndex(l => regex.test(l));
                    if (idx !== -1) {
                        const pos = new vscode.Position(idx + lineOffset, 0);
                        editor.selection = new vscode.Selection(pos, pos);
                        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
                    }
                }
                break;
            } catch (e) { }
        }
    });

    context.subscriptions.push(pinListener, toggleBookmark, jumpBookmark, clearBookmarks, smartJump);
}

export function deactivate() {}
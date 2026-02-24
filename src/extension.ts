import * as vscode from 'vscode';

const bookmarkDecorationType = vscode.window.createTextEditorDecorationType({
    gutterIconPath: vscode.Uri.parse('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDE2IDE2Ij48cGF0aCBmaWxsPSIjRkZEMDREIiBkPSJNMyAySDEzVjE0TDEwIDExTDcgMTRWMloiLz48L3N2Zz4='),
    gutterIconSize: 'contain',
    overviewRulerColor: 'rgba(255, 208, 77, 0.8)',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
});

export function activate(context: vscode.ExtensionContext) {
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

    // --- UPDATED TREE PROVIDER ---
    class BookmarkProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
        private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
        readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

        refresh(): void { this._onDidChangeTreeData.fire(); }
        getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

        async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
            const uris = Object.keys(bookmarks).filter(u => bookmarks[u].length > 0);

            // 1. Root Level: Namespaces
            if (!element) {
                const namespaces = [...new Set(uris.map(u => vscode.Uri.parse(u).authority))];
                return namespaces.map(ns => {
                    const nsUris = uris.filter(u => vscode.Uri.parse(u).authority === ns);
                    const totalInNs = nsUris.reduce((sum, u) => sum + bookmarks[u].length, 0);
                    return new NamespaceItem(ns, totalInNs);
                });
            }

            // 2. Middle Level: Files within a Namespace
            if (element instanceof NamespaceItem) {
                return uris
                    .filter(u => vscode.Uri.parse(u).authority === element.label)
                    .map(u => new FileItem(u, bookmarks[u].length));
            }

            // 3. Leaf Level: Bookmarks within a File
            if (element instanceof FileItem) {
                try {
                    const doc = await vscode.workspace.openTextDocument(element.uri);
                    const textLines = doc.getText().split(/\r?\n/);
                    const fileLines = (bookmarks[element.uri.toString()] || []).sort((a, b) => a - b);

                    return fileLines.map(line => {
                        let labelName = `Line ${line + 1}`;
                        for (let i = line; i >= 0; i--) {
                            const match = textLines[i].match(/^([%A-Za-z0-9]+)\b/) || textLines[i].match(/Method\s+([%A-Za-z0-9]+)/i);
                            if (match) {
                                const offset = line - i;
                                labelName = offset === 0 ? match[1] : `${match[1]}+${offset}`;
                                break;
                            }
                        }
                        return new BookmarkItem(labelName, line, element.uri);
                    });
                } catch (e) { return []; }
            }
            return [];
        }
    }

    class NamespaceItem extends vscode.TreeItem {
        constructor(public readonly label: string, count: number) {
            super(label, vscode.TreeItemCollapsibleState.Expanded);
            this.iconPath = new vscode.ThemeIcon('server');
            this.description = `${count} bookmarks`;
            this.contextValue = 'namespaceItem';
        }
    }

    class FileItem extends vscode.TreeItem {
        public readonly uri: vscode.Uri;
        constructor(uriString: string, count: number) {
            const uri = vscode.Uri.parse(uriString);
            const fileName = uri.path.split('/').pop() || 'Unknown';
            super(fileName, vscode.TreeItemCollapsibleState.Collapsed);
            this.uri = uri;
            this.iconPath = vscode.ThemeIcon.File;
            this.description = `${count} bookmarks`;
            this.contextValue = 'fileItem';
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

    vscode.commands.registerCommand('workspace-smart-search.clearFileBookmarks', async (item: FileItem) => {
        delete bookmarks[item.uri.toString()];
        await context.workspaceState.update('isfsBookmarks', bookmarks);
        updateDecorations(vscode.window.activeTextEditor);
    });

    // New: Clear everything in a specific Namespace
    vscode.commands.registerCommand('workspace-smart-search.clearNamespaceBookmarks', async (item: NamespaceItem) => {
        const uris = Object.keys(bookmarks).filter(u => vscode.Uri.parse(u).authority === item.label);
        uris.forEach(u => delete bookmarks[u]);
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
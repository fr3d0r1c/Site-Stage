document.addEventListener('DOMContentLoaded', () => {
    // === TARGET FRENCH EDITOR ELEMENTS ===
    const editor = document.getElementById('content-editor-fr'); // Updated ID
    const preview = document.getElementById('content-preview-fr'); // Updated ID
    const titleInput = document.getElementById('title_fr'); // Updated ID

    // Ensure elements exist before adding listeners
    if (!editor || !preview || !titleInput) return;

    let isUpdating = false;

    function updateFromEditor() {
        if (isUpdating) return;
        isUpdating = true;

        const markdownText = editor.value;

        // Auto-fill title logic (targets title_fr)
        const lines = markdownText.split('\n');
        if (lines.length > 0 && lines[0].startsWith('# ')) {
            const potentialTitle = lines[0].substring(2).trim();
            titleInput.value = potentialTitle;
        }

        // Preview logic (targets content-preview-fr)
        const htmlText = marked.parse(markdownText);
        preview.innerHTML = htmlText;
        
        isUpdating = false;
    }

    function updateFromTitle() {
        if (isUpdating) return;
        isUpdating = true;

        const newTitle = titleInput.value;
        const lines = editor.value.split('\n');

        if (lines.length > 0 && lines[0].startsWith('# ')) {
            lines[0] = '# ' + newTitle;
        } else {
            lines.unshift('# ' + newTitle);
        }
        
        editor.value = lines.join('\n');
        
        // Update preview after title changes editor
        const htmlText = marked.parse(editor.value);
        preview.innerHTML = htmlText;
        
        isUpdating = false;
    }

    editor.addEventListener('input', updateFromEditor);
    titleInput.addEventListener('input', updateFromTitle);

    // Initial update on load
    updateFromEditor();
});
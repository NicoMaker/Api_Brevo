// Aggiunge un listener per mostrare il nome del file selezionato
document.getElementById('csvFile').addEventListener('change', function (e) {
    const fileName = e.target.files[0]?.name;
    if (fileName) {
        const output = document.getElementById('output');
        output.innerHTML = `<span class="text-success">📄</span> File selezionato: <span class="text-highlight">${fileName}</span>\n<span class="text-info">ℹ️</span> Pronto per l'importazione. Clicca su "Importa Contatti" per iniziare.`;
    }
});

// Aggiunge supporto per drag and drop
const dropArea = document.querySelector('.file-drop-area');

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    dropArea.addEventListener(eventName, highlight, false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, unhighlight, false);
});

function highlight() {
    dropArea.classList.add('highlight');
}

function unhighlight() {
    dropArea.classList.remove('highlight');
}

dropArea.addEventListener('drop', handleDrop, false);

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    document.getElementById('csvFile').files = files;

    // Trigger change event
    const event = new Event('change');
    document.getElementById('csvFile').dispatchEvent(event);
}
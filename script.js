// Funzione per importare contatti da CSV
function importCSV() {
  const fileInput = document.getElementById("csvFile");
  const apiKeyInput = document.getElementById("apiKey");
  const listIdInput = document.getElementById("listId");
  const cleanEmailsCheckbox = document.getElementById("cleanEmails");
  const continueOnIpErrorCheckbox =
    document.getElementById("continueOnIpError");
  const output = document.getElementById("output");
  const importButton = document.getElementById("importButton");
  const progressContainer = document.getElementById("progressContainer");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");
  const progressStats = document.getElementById("progressStats");
  const statsContainer = document.getElementById("stats");
  const totalCountEl = document.getElementById("totalCount");
  const successCountEl = document.getElementById("successCount");
  const errorCountEl = document.getElementById("errorCount");

  // Validazione input
  if (!apiKeyInput.value.trim()) {
    output.textContent = "⚠️ Inserisci la tua API Key di Brevo.";
    return;
  }

  if (!fileInput.files.length) {
    output.textContent = "⚠️ Seleziona un file CSV.";
    return;
  }

  const apiKey = apiKeyInput.value.trim();
  const listId = parseInt(listIdInput.value) || 2;
  const cleanEmails = cleanEmailsCheckbox.checked;
  const continueOnIpError = continueOnIpErrorCheckbox.checked;

  // Prepara l'interfaccia
  importButton.disabled = true;
  output.textContent = "📦 Elaborazione del file CSV...\n";
  progressContainer.classList.remove("hidden");
  statsContainer.classList.remove("hidden");

  // Contatori
  let aggiunti = 0;
  let errori = 0;
  let completati = 0;
  let ipErrorDetected = false;

  Papa.parse(fileInput.files[0], {
    header: true,
    skipEmptyLines: true,
    complete: function (results) {
      const contacts = results.data;
      const totalContacts = contacts.length;

      if (totalContacts === 0) {
        output.textContent = "⚠️ Il file CSV non contiene contatti validi.";
        importButton.disabled = false;
        return;
      }

      totalCountEl.textContent = totalContacts;
      output.textContent = `📋 Trovati ${totalContacts} contatti nel file CSV.\n\n`;

      // Processa ogni contatto
      contacts.forEach((contact, index) => {
        let email = contact.email?.trim();

        if (!email) {
          errori++;
          completati++;
          updateProgress(completati, totalContacts);
          output.textContent += `❌ Riga ${index + 1}: Email mancante\n`;
          return;
        }

        // Pulizia e correzione email se abilitato
        if (cleanEmails) {
          // Gestione di email multiple (separate da trattini o spazi)
          if (email.includes(" - ")) {
            const emails = email.split(" - ");
            email = emails[0].trim(); // Prendi la prima email
            output.textContent += `ℹ️ Email multipla trovata: "${contact.email}". Utilizzo: "${email}"\n`;
          }

          // Correzione errori comuni
          email = email.replace(/\s+/g, ""); // Rimuovi spazi

          // Correzione domini comuni
          if (email.endsWith("@tiscaliit"))
            email = email.replace("@tiscaliit", "@tiscali.it");
          if (email.endsWith("@libero")) email = email + ".it";
          if (email.includes("comune.")) {
            if (!email.includes("@")) {
              const parts = email.split("comune.");
              if (parts.length === 2) {
                email = parts[0] + "@comune." + parts[1];
              }
            }
          }

          // Correzione domini incompleti
          if (email.includes("@") && !email.includes(".")) {
            email = email + ".it"; // Aggiungi .it se manca il TLD
          }
        }

        // Verifica formato email
        if (!isValidEmail(email)) {
          errori++;
          completati++;
          updateProgress(completati, totalContacts);
          output.textContent += `❌ Email non valida: ${email}\n`;
          return;
        }

        // Prepara attributi aggiuntivi (se presenti nel CSV)
        const attributes = {};
        Object.keys(contact).forEach((key) => {
          if (key !== "email" && contact[key]) {
            attributes[key] = contact[key];
          }
        });

        // Se è stato rilevato un errore di IP e l'utente non ha scelto di continuare, salta
        if (ipErrorDetected && !continueOnIpError) {
          errori++;
          completati++;
          updateProgress(completati, totalContacts);
          return;
        }

        // Aggiungi il contatto tramite l'API Brevo
        setTimeout(() => {
          // Aggiungiamo un piccolo ritardo per evitare rate limiting
          fetch("https://api.brevo.com/v3/contacts", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "api-key": apiKey,
            },
            body: JSON.stringify({
              email: email,
              attributes:
                Object.keys(attributes).length > 0 ? attributes : undefined,
              listIds: [listId],
              updateEnabled: true,
            }),
          })
            .then((res) => {
              if (!res.ok) {
                return res.json().then((data) => {
                  throw new Error(data.message || `Errore ${res.status}`);
                });
              }
              return res.json();
            })
            .then(() => {
              aggiunti++;
              output.textContent += `✅ Aggiunto: ${email}\n`;
            })
            .catch((err) => {
              errori++;
              const errorMsg = err.message || err;
              output.textContent += `❌ Errore con ${email}: ${errorMsg}\n`;

              // Rileva errori di IP non autorizzato
              if (errorMsg.includes("unrecognised IP address")) {
                ipErrorDetected = true;

                // Mostra avviso se è il primo errore di IP
                if (errori === 1) {
                  const ipMatch = errorMsg.match(
                    /unrecognised IP address ([0-9.]+)/
                  );
                  const ipAddress = ipMatch ? ipMatch[1] : "sconosciuto";

                  output.textContent += `\n⚠️ ATTENZIONE: Brevo ha bloccato le richieste perché provengono da un IP non autorizzato (${ipAddress}).\n`;
                  output.textContent += `Per risolvere questo problema, vai su https://app.brevo.com/security/authorised_ips e aggiungi questo IP alla lista degli IP autorizzati.\n\n`;

                  if (!continueOnIpError) {
                    output.textContent += `L'importazione è stata interrotta. Seleziona l'opzione "Continua nonostante errori di IP non autorizzato" se vuoi continuare comunque.\n\n`;
                  }
                }
              }
            })
            .finally(() => {
              completati++;
              successCountEl.textContent = aggiunti;
              errorCountEl.textContent = errori;
              updateProgress(completati, totalContacts);

              if (completati === totalContacts) {
                output.textContent += `\n🎯 Importazione completata!\n✅ Totale aggiunti: ${aggiunti}\n❌ Errori: ${errori}\n`;
                importButton.disabled = false;

                if (ipErrorDetected) {
                  output.textContent += `\n⚠️ Sono stati rilevati errori di IP non autorizzato. Assicurati di autorizzare il tuo IP in Brevo prima di riprovare.\n`;
                }
              }
            });
        }, index * 100); // Ritardo progressivo per evitare rate limiting
      });
    },
    error: function (error) {
      output.textContent = `⚠️ Errore durante la lettura del file CSV: ${error}`;
      importButton.disabled = false;
    },
  });

  // Funzione per aggiornare la barra di progresso
  function updateProgress(completed, total) {
    const percentage = Math.round((completed / total) * 100);
    progressBar.style.width = `${percentage}%`;
    progressText.textContent = `${percentage}%`;
    progressStats.textContent = `${completed}/${total}`;
  }

  // Funzione per validare email
  function isValidEmail(email) {
    // Regex più permissiva per catturare più formati di email
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }
}

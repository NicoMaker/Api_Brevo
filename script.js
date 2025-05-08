// Funzione per importare contatti da CSV
async function importCSV() {
  const fileInput = document.getElementById("csvFile")
  const apiKeyInput = document.getElementById("apiKey")
  const contactsPerListInput = document.getElementById("contactsPerList")
  const listNamePrefixInput = document.getElementById("listNamePrefix")
  const cleanEmailsCheckbox = document.getElementById("cleanEmails")
  const continueOnIpErrorCheckbox = document.getElementById("continueOnIpError")
  const createListsIfNotExistCheckbox = document.getElementById("createListsIfNotExist")
  const output = document.getElementById("output")
  const importButton = document.getElementById("importButton")
  const progressContainer = document.getElementById("progressContainer")
  const progressBar = document.getElementById("progressBar")
  const progressText = document.getElementById("progressText")
  const progressStats = document.getElementById("progressStats")
  const statsContainer = document.getElementById("stats")
  const totalCountEl = document.getElementById("totalCount")
  const successCountEl = document.getElementById("successCount")
  const errorCountEl = document.getElementById("errorCount")
  const createdListsContainer = document.getElementById("createdListsContainer")
  const createdListsList = document.getElementById("createdListsList")

  // Validazione input
  if (!apiKeyInput.value.trim()) {
    output.textContent = "⚠️ Inserisci la tua API Key di Brevo."
    return
  }

  if (!fileInput.files.length) {
    output.textContent = "⚠️ Seleziona un file CSV."
    return
  }

  const apiKey = apiKeyInput.value.trim()
  const contactsPerList = Number.parseInt(contactsPerListInput.value) || 300
  const listNamePrefix = listNamePrefixInput.value.trim() || "lista_contatti_"
  const cleanEmails = cleanEmailsCheckbox.checked
  const continueOnIpError = continueOnIpErrorCheckbox.checked
  const createListsIfNotExist = createListsIfNotExistCheckbox.checked

  // Prepara l'interfaccia
  importButton.disabled = true
  output.textContent = "📦 Elaborazione del file CSV...\n"
  progressContainer.classList.remove("hidden")
  statsContainer.classList.remove("hidden")
  createdListsContainer.classList.add("hidden")
  createdListsList.innerHTML = ""

  // Contatori
  let aggiunti = 0
  let errori = 0
  let completati = 0
  let ipErrorDetected = false
  const createdLists = []

  // Ottieni tutte le liste esistenti
  let existingLists = []
  try {
    output.textContent += "🔍 Recupero delle liste esistenti...\n"
    existingLists = await fetchExistingLists(apiKey)
    output.textContent += `✅ Recuperate ${existingLists.length} liste esistenti.\n\n`
  } catch (error) {
    output.textContent += `❌ Errore nel recupero delle liste: ${error.message}\n`
    if (error.message.includes("unrecognised IP address")) {
      ipErrorDetected = true
      handleIpError(error.message, output, continueOnIpError)
    }
    importButton.disabled = false
    return
  }

  // Usa Papa.parse per leggere il file CSV
  Papa.parse(fileInput.files[0], {
    header: true,
    skipEmptyLines: true,
    complete: async (results) => {
      const contacts = results.data
      const totalContacts = contacts.length

      if (totalContacts === 0) {
        output.textContent = "⚠️ Il file CSV non contiene contatti validi."
        importButton.disabled = false
        return
      }

      totalCountEl.textContent = totalContacts
      output.textContent += `📋 Trovati ${totalContacts} contatti nel file CSV.\n\n`

      // Determina il formato del CSV
      const hasEmail = contacts[0].hasOwnProperty("email")
      const hasName = contacts[0].hasOwnProperty("nome") || contacts[0].hasOwnProperty("name")
      const hasSurname = contacts[0].hasOwnProperty("cognome") || contacts[0].hasOwnProperty("surname")

      if (!hasEmail) {
        // Cerca una colonna che potrebbe contenere email
        const possibleEmailColumns = Object.keys(contacts[0]).filter(
          (key) =>
            key.toLowerCase().includes("email") ||
            key.toLowerCase().includes("mail") ||
            key.toLowerCase().includes("e-mail"),
        )

        if (possibleEmailColumns.length > 0) {
          output.textContent += `ℹ️ Colonna email non trovata, ma utilizzerò "${possibleEmailColumns[0]}" come colonna email.\n\n`
          // Rinomina la colonna in "email" per tutti i contatti
          contacts.forEach((contact) => {
            contact.email = contact[possibleEmailColumns[0]]
          })
        } else {
          output.textContent = "⚠️ Il file CSV non contiene una colonna email riconoscibile."
          importButton.disabled = false
          return
        }
      }

      // Suddividi i contatti in gruppi per lista
      const contactGroups = []
      for (let i = 0; i < totalContacts; i += contactsPerList) {
        contactGroups.push(contacts.slice(i, i + contactsPerList))
      }

      output.textContent += `📊 I contatti saranno suddivisi in ${contactGroups.length} liste.\n\n`

      // Crea le liste necessarie se non esistono
      const listIds = []
      for (let i = 0; i < contactGroups.length; i++) {
        const listName = `${listNamePrefix}${i + 1}`
        let listId = findListIdByName(existingLists, listName)

        if (!listId && createListsIfNotExist) {
          try {
            output.textContent += `🔨 Creazione della lista "${listName}"...\n`
            listId = await createList(apiKey, listName)
            createdLists.push({ name: listName, id: listId })
            output.textContent += `✅ Lista "${listName}" creata con ID: ${listId}\n`
          } catch (error) {
            output.textContent += `❌ Errore nella creazione della lista "${listName}": ${error.message}\n`
            if (error.message.includes("unrecognised IP address")) {
              ipErrorDetected = true
              handleIpError(error.message, output, continueOnIpError)
              if (!continueOnIpError) {
                importButton.disabled = false
                return
              }
            }
          }
        } else if (!listId) {
          output.textContent += `⚠️ La lista "${listName}" non esiste e la creazione automatica è disabilitata.\n`
          errori += contactGroups[i].length
          completati += contactGroups[i].length
          updateProgress(completati, totalContacts)
          continue
        }

        listIds.push(listId)
      }

      // Mostra le liste create
      if (createdLists.length > 0) {
        createdListsContainer.classList.remove("hidden")
        createdLists.forEach((list) => {
          const li = document.createElement("li")
          li.textContent = `${list.name} (ID: ${list.id})`
          createdListsList.appendChild(li)
        })
      }

      // Processa ogni gruppo di contatti
      for (let groupIndex = 0; groupIndex < contactGroups.length; groupIndex++) {
        const group = contactGroups[groupIndex]
        const listId = listIds[groupIndex]

        if (!listId) {
          continue // Salta questo gruppo se non abbiamo un ID lista valido
        }

        output.textContent += `\n📤 Importazione di ${group.length} contatti nella lista "${listNamePrefix}${groupIndex + 1}" (ID: ${listId})...\n\n`

        // Processa ogni contatto nel gruppo
        for (let contactIndex = 0; contactIndex < group.length; contactIndex++) {
          const contact = group[contactIndex]
          const globalIndex = groupIndex * contactsPerList + contactIndex

          let email = contact.email?.trim()

          if (!email) {
            errori++
            completati++
            updateProgress(completati, totalContacts)
            output.textContent += `❌ Contatto ${globalIndex + 1}: Email mancante\n`
            continue
          }

          // Pulizia e correzione email se abilitato
          if (cleanEmails) {
            email = cleanEmailAddress(email, output, globalIndex)
          }

          // Verifica formato email
          if (!isValidEmail(email)) {
            errori++
            completati++
            updateProgress(completati, totalContacts)
            output.textContent += `❌ Email non valida: ${email}\n`
            continue
          }

          // Prepara attributi aggiuntivi (se presenti nel CSV)
          const attributes = {}
          Object.keys(contact).forEach((key) => {
            if (key !== "email" && contact[key]) {
              // Gestisci nome e cognome in modo speciale
              if (key === "nome" || key === "name") {
                attributes.FIRSTNAME = contact[key]
              } else if (key === "cognome" || key === "surname") {
                attributes.LASTNAME = contact[key]
              } else {
                attributes[key.toUpperCase()] = contact[key]
              }
            }
          })

          // Se è stato rilevato un errore di IP e l'utente non ha scelto di continuare, salta
          if (ipErrorDetected && !continueOnIpError) {
            errori++
            completati++
            updateProgress(completati, totalContacts)
            continue
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
                attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
                listIds: [listId],
                updateEnabled: true,
              }),
            })
              .then((res) => {
                if (!res.ok) {
                  return res.json().then((data) => {
                    throw new Error(data.message || `Errore ${res.status}`)
                  })
                }
                return res.json()
              })
              .then(() => {
                aggiunti++
                output.textContent += `✅ Aggiunto: ${email} alla lista ${listNamePrefix}${groupIndex + 1}\n`
              })
              .catch((err) => {
                errori++
                const errorMsg = err.message || err
                output.textContent += `❌ Errore con ${email}: ${errorMsg}\n`

                // Rileva errori di IP non autorizzato
                if (errorMsg.includes("unrecognised IP address")) {
                  ipErrorDetected = true
                  handleIpError(errorMsg, output, continueOnIpError)
                }
              })
              .finally(() => {
                completati++
                successCountEl.textContent = aggiunti
                errorCountEl.textContent = errori
                updateProgress(completati, totalContacts)

                if (completati === totalContacts) {
                  output.textContent += `\n🎯 Importazione completata!\n✅ Totale aggiunti: ${aggiunti}\n❌ Errori: ${errori}\n`
                  importButton.disabled = false

                  if (ipErrorDetected) {
                    output.textContent += `\n⚠️ Sono stati rilevati errori di IP non autorizzato. Assicurati di autorizzare il tuo IP in Brevo prima di riprovare.\n`
                  }
                }
              })
          }, contactIndex * 100) // Ritardo progressivo per evitare rate limiting
        }
      }
    },
    error: (error) => {
      output.textContent = `⚠️ Errore durante la lettura del file CSV: ${error}`
      importButton.disabled = false
    },
  })
}

// Funzione per recuperare le liste esistenti
async function fetchExistingLists(apiKey) {
  try {
    const response = await fetch("https://api.brevo.com/v3/contacts/lists?limit=50", {
      method: "GET",
      headers: {
        "api-key": apiKey,
      },
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.message || `Errore ${response.status}`)
    }

    const data = await response.json()
    return data.lists || []
  } catch (error) {
    throw error
  }
}

// Funzione per creare una nuova lista
async function createList(apiKey, listName) {
  try {
    const response = await fetch("https://api.brevo.com/v3/contacts/lists", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        name: listName,
        folderId: 1, // Cartella predefinita
      }),
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.message || `Errore ${response.status}`)
    }

    const data = await response.json()
    return data.id
  } catch (error) {
    throw error
  }
}

// Funzione per trovare l'ID di una lista dal nome
function findListIdByName(lists, name) {
  const list = lists.find((list) => list.name === name)
  return list ? list.id : null
}

// Funzione per pulire e correggere un indirizzo email
function cleanEmailAddress(email, output, index) {
  const originalEmail = email

  // Gestione di email multiple (separate da trattini o spazi)
  if (email.includes(" - ")) {
    const emails = email.split(" - ")
    email = emails[0].trim() // Prendi la prima email
    output.textContent += `ℹ️ Email multipla trovata: "${originalEmail}". Utilizzo: "${email}"\n`
  }

  // Correzione errori comuni
  email = email.replace(/\s+/g, "") // Rimuovi spazi

  // Correzione domini comuni
  if (email.endsWith("@tiscaliit")) email = email.replace("@tiscaliit", "@tiscali.it")
  if (email.endsWith("@libero")) email = email + ".it"
  if (email.includes("comune.")) {
    if (!email.includes("@")) {
      const parts = email.split("comune.")
      if (parts.length === 2) {
        email = parts[0] + "@comune." + parts[1]
      }
    }
  }

  // Correzione domini incompleti
  if (email.includes("@") && !email.includes(".")) {
    email = email + ".it" // Aggiungi .it se manca il TLD
  }

  // Se l'email è stata modificata, registra il cambiamento
  if (email !== originalEmail) {
    output.textContent += `🔧 Email corretta: "${originalEmail}" → "${email}"\n`
  }

  return email
}

// Funzione per gestire errori di IP non autorizzato
function handleIpError(errorMsg, output, continueOnIpError) {
  const ipMatch = errorMsg.match(/unrecognised IP address ([0-9.]+)/)
  const ipAddress = ipMatch ? ipMatch[1] : "sconosciuto"

  output.textContent += `\n⚠️ ATTENZIONE: Brevo ha bloccato le richieste perché provengono da un IP non autorizzato (${ipAddress}).\n`
  output.textContent += `Per risolvere questo problema, vai su https://app.brevo.com/security/authorised_ips e aggiungi questo IP alla lista degli IP autorizzati.\n\n`

  if (!continueOnIpError) {
    output.textContent += `L'importazione è stata interrotta. Seleziona l'opzione "Continua nonostante errori di IP non autorizzato" se vuoi continuare comunque.\n\n`
  }
}

// Funzione per aggiornare la barra di progresso
function updateProgress(completed, total) {
  const percentage = Math.round((completed / total) * 100)
  const progressBar = document.getElementById("progressBar")
  const progressText = document.getElementById("progressText")
  const progressStats = document.getElementById("progressStats")

  progressBar.style.width = `${percentage}%`
  progressText.textContent = `${percentage}%`
  progressStats.textContent = `${completed}/${total}`
}

// Funzione per validare email
function isValidEmail(email) {
  // Regex più permissiva per catturare più formati di email
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return re.test(email)
}

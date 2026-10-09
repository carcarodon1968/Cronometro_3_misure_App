import React, { useState } from 'react';
import { Check, Copy, FileCode, Terminal } from 'lucide-react';

interface CodeFile {
  id: string;
  filename: string;
  title: string;
  description: string;
  language: string;
  code: string;
}

const ANDROID_FILES: CodeFile[] = [
  {
    id: 'github_apk_yml',
    filename: '.github/workflows/main.yml',
    title: 'GitHub Action Completa — Link Web App + File .APK',
    description:
      'Incolla questo codice in .github/workflows/main.yml: pubblica il Link della Web App su GitHub Pages e genera contemporaneamente il file CronoTri-Android-APK.',
    language: 'yaml',
    code: `name: Build APK & Deploy Web App Link

on:
  push:
    branches: ["main", "master"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  build_and_deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Setup Java JDK 17 for Android
        uses: actions/setup-java@v4
        with:
          distribution: "temurin"
          java-version: "17"

      - name: Fix package.json versions & Build Web App
        run: |
          node -e '
            const fs = require("fs");
            const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
            pkg.dependencies = {
              "react": "^19.0.0",
              "react-dom": "^19.0.0",
              "lucide-react": "latest"
            };
            pkg.devDependencies = {
              "@tailwindcss/vite": "^4.0.0",
              "@types/node": "^22.0.0",
              "@types/react": "^19.0.0",
              "@types/react-dom": "^19.0.0",
              "@vitejs/plugin-react": "^4.3.0",
              "tailwindcss": "^4.0.0",
              "typescript": "^5.7.0",
              "vite": "^6.0.0",
              "vite-plugin-pwa": "^0.21.0"
            };
            fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));
          '
          npm install --legacy-peer-deps
          npm run build

      - name: Configure GitHub Pages
        uses: actions/configure-pages@v5

      - name: Upload Web App to GitHub Pages
        uses: actions/upload-pages-artifact@v3
        with:
          path: "./dist"

      - name: Publish Web App Link on GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4

      - name: Build Installable Android APK (Cronometro 3 misure)
        run: |
          npm install --no-save --legacy-peer-deps @capacitor/core@6 @capacitor/cli@6 @capacitor/android@6
          rm -rf capacitor.config.* android
          npx cap init "Cronometro 3 misure" "com.cronometro3misure.app" --web-dir dist
          npx cap add android
          npx cap copy android
          for dir in android/app/src/main/res/mipmap-*dpi; do
            if [ -d "\$dir" ]; then
              cp public/pwa-512x512.png "\$dir/ic_launcher.png"
              cp public/pwa-512x512.png "\$dir/ic_launcher_round.png"
              cp public/pwa-maskable-512x512.png "\$dir/ic_launcher_foreground.png"
            fi
          done
          chmod +x android/gradlew
          cd android && ./gradlew assembleDebug --no-daemon

      - name: Upload Cronometro-3-misure-APK
        uses: actions/upload-artifact@v4
        with:
          name: Cronometro-3-misure-APK
          path: android/app/build/outputs/apk/debug/app-debug.apk`,
  },
  {
    id: 'github_pages_yml',
    filename: '.github/workflows/deploy.yml',
    title: 'GitHub Action — Pubblica Link Web App su GitHub Pages',
    description:
      'Pubblica automaticamente la Web App su https://tuo-username.github.io/nome-repo/ ogni volta che salvi.',
    language: 'yaml',
    code: `name: Deploy Web App to GitHub Pages

on:
  push:
    branches: ["main", "master"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  build_and_deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm install

      - name: Build CronoTri PWA
        run: npm run build

      - name: Configure GitHub Pages
        uses: actions/configure-pages@v5

      - name: Upload artifact for GitHub Pages
        uses: actions/upload-pages-artifact@v3
        with:
          path: "./dist"

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4`,
  },
  {
    id: 'entity_dao',
    filename: 'data/MeasurementDatabase.kt',
    title: '1. Database Locale Room (Entity, DAO & Database)',
    description:
      'Tabella SQLite locale per salvare Categoria (incluso Flusso), Etichetta, quantitativo Contenitore, i 3 tempi registrati, la media e il rapporto Contenitore ÷ Media.',
    language: 'kotlin',
    code: `package com.cronotri.app.data

import android.content.Context
import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "measurement_history")
data class MeasurementEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val label: String,
    val category: String, // "Flusso", "Sport", "Laboratorio", "Produzione", "Generale"
    val containerAmount: Double?, // Quantitativo del recipiente
    val flowRatePerSec: Double?,  // Contenitore / Media dei tempi (in secondi)
    val time1Ms: Long?,
    val time2Ms: Long?,
    val time3Ms: Long?,
    val avgStop1Ms: Long?,
    val avgStop2Ms: Long?,
    val avgStop3Ms: Long?,
    val finalAverageMs: Long,
    val createdAt: Long = System.currentTimeMillis()
)

@Dao
interface MeasurementDao {
    @Query("SELECT * FROM measurement_history ORDER BY createdAt DESC")
    fun observeAllHistory(): Flow<List<MeasurementEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSession(entity: MeasurementEntity): Long

    @Delete
    suspend fun deleteSession(entity: MeasurementEntity)

    @Query("DELETE FROM measurement_history")
    suspend fun clearAll()
}

@Database(entities = [MeasurementEntity::class], version = 2, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun measurementDao(): MeasurementDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getInstance(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "cronotri_local.db"
                )
                .fallbackToDestructiveMigration()
                .build().also { INSTANCE = it }
            }
        }
    }
}`,
  },
  {
    id: 'viewmodel',
    filename: 'ui/ChronometerViewModel.kt',
    title: '2. ViewModel Cronometro, Media e Divisione Contenitore ÷ Media',
    description:
      'Popola il 1°, 2° e 3° campo a ogni STOP, calcola la media dei tempi registrati (1, 2 o 3) e divide automaticamente il quantitativo del Contenitore per la media dei tempi.',
    language: 'kotlin',
    code: `package com.cronotri.app.ui

import android.os.SystemClock
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.cronotri.app.data.MeasurementDao
import com.cronotri.app.data.MeasurementEntity
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class ChronoUiState(
    val isRunning: Boolean = false,
    val elapsedMs: Long = 0L,
    val currentSlot: Int = 1, // 1, 2 o 3
    val category: String = "Flusso",
    val sessionLabel: String = "",
    val containerInput: String = "",
    val time1Ms: Long? = null,
    val time2Ms: Long? = null,
    val time3Ms: Long? = null,
    val currentAverageMs: Long? = null,
    val currentFlowPerSec: Double? = null // Contenitore / Media (s)
)

class ChronometerViewModel(private val dao: MeasurementDao) : ViewModel() {

    private val _uiState = MutableStateFlow(ChronoUiState())
    val uiState: StateFlow<ChronoUiState> = _uiState.asStateFlow()

    val historyList: StateFlow<List<MeasurementEntity>> = dao.observeAllHistory()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private var timerJob: Job? = null
    private var startRealtimeMs: Long = 0L

    private fun calculateFlow(containerStr: String, avgMs: Long?): Double? {
        val containerVal = containerStr.replace(',', '.').toDoubleOrNull() ?: return null
        if (containerVal <= 0.0 || avgMs == null || avgMs <= 0L) return null
        val avgSeconds = avgMs / 1000.0
        return containerVal / avgSeconds
    }

    fun startChronometer() {
        if (_uiState.value.isRunning) return
        if (_uiState.value.time1Ms != null && _uiState.value.time2Ms != null && _uiState.value.time3Ms != null) {
            resetCurrentFields()
        }

        startRealtimeMs = SystemClock.elapsedRealtime()
        _uiState.update { it.copy(isRunning = true, elapsedMs = 0L) }

        timerJob = viewModelScope.launch {
            while (true) {
                val now = SystemClock.elapsedRealtime()
                _uiState.update { it.copy(elapsedMs = now - startRealtimeMs) }
                delay(16L)
            }
        }
    }

    /**
     * Ogni volta che si preme STOP (1°, 2° o 3° dato):
     * 1. Riempie automaticamente il campo corrispondente
     * 2. Calcola la media di tutti i tempi registrati finora (1, 2 o 3)
     * 3. Divide il quantitativo Contenitore inserito per la media dei tempi
     */
    fun stopAndRecord() {
        val state = _uiState.value
        if (!state.isRunning) return

        timerJob?.cancel()
        val finalElapsed = (SystemClock.elapsedRealtime() - startRealtimeMs).coerceAtLeast(1L)

        val newT1 = if (state.currentSlot == 1) finalElapsed else state.time1Ms
        val newT2 = if (state.currentSlot == 2) finalElapsed else state.time2Ms
        val newT3 = if (state.currentSlot == 3) finalElapsed else state.time3Ms

        val recordedList = listOfNotNull(newT1, newT2, newT3)
        val newAverage = if (recordedList.isNotEmpty()) {
            recordedList.sum() / recordedList.size
        } else null

        val newFlow = calculateFlow(state.containerInput, newAverage)

        val nextSlot = when (state.currentSlot) {
            1 -> 2
            2 -> 3
            else -> 1
        }

        _uiState.update {
            it.copy(
                isRunning = false,
                elapsedMs = finalElapsed,
                time1Ms = newT1,
                time2Ms = newT2,
                time3Ms = newT3,
                currentAverageMs = newAverage,
                currentFlowPerSec = newFlow,
                currentSlot = nextSlot
            )
        }

        if (state.currentSlot == 3 && newT1 != null && newT2 != null && newT3 != null && newAverage != null) {
            saveCurrentSessionToDb(newT1, newT2, newT3, newAverage, newFlow)
        }
    }

    fun updateCategory(cat: String) {
        _uiState.update { it.copy(category = cat) }
    }

    fun updateLabel(label: String) {
        _uiState.update { it.copy(sessionLabel = label) }
    }

    fun updateContainer(value: String) {
        _uiState.update {
            val recomputedFlow = calculateFlow(value, it.currentAverageMs)
            it.copy(containerInput = value, currentFlowPerSec = recomputedFlow)
        }
    }

    private fun saveCurrentSessionToDb(t1: Long?, t2: Long?, t3: Long?, finalAvg: Long, flow: Double?) {
        viewModelScope.launch {
            val s = _uiState.value
            val label = s.sessionLabel.ifBlank { "Misurazione" }
            val containerVal = s.containerInput.replace(',', '.').toDoubleOrNull()
            val avg1 = t1
            val avg2 = if (t1 != null && t2 != null) (t1 + t2) / 2 else null
            val avg3 = if (t1 != null && t2 != null && t3 != null) (t1 + t2 + t3) / 3 else null

            dao.insertSession(
                MeasurementEntity(
                    label = label,
                    category = s.category,
                    containerAmount = containerVal,
                    flowRatePerSec = flow,
                    time1Ms = t1,
                    time2Ms = t2,
                    time3Ms = t3,
                    avgStop1Ms = avg1,
                    avgStop2Ms = avg2,
                    avgStop3Ms = avg3,
                    finalAverageMs = finalAvg
                )
            )
        }
    }

    fun resetCurrentFields() {
        timerJob?.cancel()
        _uiState.update {
            it.copy(
                isRunning = false,
                elapsedMs = 0L,
                currentSlot = 1,
                time1Ms = null,
                time2Ms = null,
                time3Ms = null,
                currentAverageMs = null,
                currentFlowPerSec = null
            )
        }
    }
}`,
  },
  {
    id: 'main_activity',
    filename: 'MainActivity.kt',
    title: '3. Interfaccia Android Dark Mode (Campi in alto prima del Cronometro)',
    description:
      'Posiziona Categoria (con Flusso), Etichetta Sessione e Contenitore in alto prima del cronometro e mostra la divisione Contenitore ÷ Media.',
    language: 'kotlin',
    code: `package com.cronotri.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cronotri.app.data.AppDatabase
import com.cronotri.app.ui.ChronometerViewModel
import java.util.Locale

fun formatMs(ms: Long?): String {
    if (ms == null) return "--:--.--"
    val minutes = (ms / 60000)
    val seconds = (ms % 60000) / 1000
    val centis = (ms % 1000) / 10
    return String.format(Locale.ITALY, "%02d:%02d.%02d", minutes, seconds, centis)
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val db = AppDatabase.getInstance(this)
        val viewModel = ChronometerViewModel(db.measurementDao())

        setContent {
            MaterialTheme(colorScheme = darkColorScheme()) {
                Surface(modifier = Modifier.fillMaxSize()) {
                    CronoTriScreen(viewModel)
                }
            }
        }
    }
}

@Composable
fun CronoTriScreen(viewModel: ChronometerViewModel) {
    val state by viewModel.uiState.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // IN ALTO PRIMA DEL CRONOMETRO: Categoria (Flusso), Etichetta Sessione, Contenitore
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = state.category,
                onValueChange = { viewModel.updateCategory(it) },
                label = { Text("Categoria (es. Flusso)") },
                modifier = Modifier.weight(1f)
            )
            OutlinedTextField(
                value = state.sessionLabel,
                onValueChange = { viewModel.updateLabel(it) },
                label = { Text("Etichetta Sessione") },
                modifier = Modifier.weight(1f)
            )
            OutlinedTextField(
                value = state.containerInput,
                onValueChange = { viewModel.updateContainer(it) },
                label = { Text("Contenitore") },
                modifier = Modifier.weight(1f)
            )
        }

        // CRONOMETRO
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = formatMs(state.elapsedMs),
                    fontSize = 44.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold
                )
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(
                        onClick = {
                            if (state.isRunning) viewModel.stopAndRecord()
                            else viewModel.startChronometer()
                        },
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(if (state.isRunning) "STOP (#\${state.currentSlot})" else "START")
                    }
                    OutlinedButton(onClick = { viewModel.resetCurrentFields() }) {
                        Text("RESET")
                    }
                }
            }
        }

        // MEDIA TEMPI E RAPPORTO CONTENITORE / MEDIA
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Media Tempi: \${formatMs(state.currentAverageMs)}", fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "Contenitore ÷ Media: \${state.currentFlowPerSec?.let { String.format(Locale.ITALY, \"%.4f l/s\", it) } ?: \"--\"}",
                    fontSize = 20.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}`,
  },
  {
    id: 'gradle',
    filename: 'app/build.gradle.kts',
    title: '4. Configurazione Dipendenze Gradle (Room + Compose)',
    description:
      'Dipendenze ufficiali AndroidX per Jetpack Compose, ViewModel e database locale SQLite con Room.',
    language: 'kotlin',
    code: `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.devtools.ksp") version "2.0.21-1.0.25"
}

android {
    namespace = "com.cronotri.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.cronotri.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }
    buildFeatures {
        compose = true
    }
}

dependencies {
    val roomVersion = "2.6.1"
    implementation("androidx.room:room-runtime:\$roomVersion")
    implementation("androidx.room:room-ktx:\$roomVersion")
    ksp("androidx.room:room-compiler:\$roomVersion")

    implementation(platform("androidx.compose:compose-bom:2024.10.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
}`,
  },
];

export const AndroidCodeView: React.FC = () => {
  const [selectedFileId, setSelectedFileId] = useState<string>(ANDROID_FILES[0].id);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeFile = ANDROID_FILES.find((f) => f.id === selectedFileId) || ANDROID_FILES[0];

  const handleCopy = async (code: string, id: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="space-y-6">
      {/* Step-by-Step Guide: GitHub Pages + Automatic APK Build on GitHub */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            Pubblica su GitHub & Genera il file .APK per i Colleghi
          </h2>
          <p className="mt-1.5 text-sm text-slate-300 leading-relaxed">
            Nel progetto sono già stati configurati in automatico due flussi <strong>GitHub Actions</strong> (nella cartella <code>.github/workflows/</code>) che compilano sia la <strong>Web App pubblica (GitHub Pages)</strong> sia il <strong>file .APK installabile per Android</strong> senza dover installare Android Studio sul tuo PC.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs sm:text-sm text-slate-300">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
            <p className="font-bold text-orange-400">
              1. Esporta il progetto su GitHub
            </p>
            <p className="text-xs leading-relaxed text-slate-300">
              Clicca sull&apos;icona <strong>GitHub</strong> o <strong>Scarica ZIP</strong> nella barra in alto a destra di Google AI Studio e carica il progetto in un nuovo repository sul tuo account GitHub (es. <code>cronotri</code>).
            </p>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
            <p className="font-bold text-emerald-400">
              2. Scarica il file .APK pronto da GitHub
            </p>
            <p className="text-xs leading-relaxed text-slate-300">
              Apri il tuo repository su GitHub e clicca sulla scheda <strong>Actions</strong> in alto: vedrai il processo <strong>&quot;Build Android APK (CronoTri.apk)&quot;</strong>. Al termine (circa 2 minuti), scorri in basso sotto <strong>Artifacts</strong> e clicca su <strong>CronoTri-Android-APK</strong> per scaricare il file <code>.apk</code> da inviare su WhatsApp ai colleghi!
            </p>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
            <p className="font-bold text-sky-400">
              3. Oppure attiva il Link WebAPK (GitHub Pages)
            </p>
            <p className="text-xs leading-relaxed text-slate-300">
              Su GitHub vai in <strong>Settings → Pages</strong> e sotto <em>Build and deployment / Source</em> seleziona <strong>GitHub Actions</strong>. Avrai un link gratuito <code>https://tuo-nome.github.io/cronotri/</code> che i colleghi possono aprire su Chrome e installare con 1 tocco.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Codice Sorgente Nativo Android (Kotlin + Room SQLite)
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Questa applicazione web è già configurata come <strong>Web App Android installabile (PWA)</strong> con database locale <strong>IndexedDB</strong> funzionante offline direttamente dal tuo smartphone. Se desideri anche compilare il pacchetto APK nativo in <strong>Android Studio</strong>, trovi qui i 4 file completi in Kotlin aggiornati con <strong>Categoria (Flusso)</strong>, <strong>Etichetta Sessione</strong>, <strong>Contenitore</strong> in alto e il calcolo automatico <code>Contenitore ÷ Media</code>.
          </p>
        </div>

        {/* File selector tabs */}
        <div className="mt-6 flex flex-wrap items-center gap-2 p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
          {ANDROID_FILES.map((file) => {
            const isActive = file.id === activeFile.id;
            return (
              <button
                key={file.id}
                onClick={() => setSelectedFileId(file.id)}
                className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <FileCode className="w-4 h-4 shrink-0 text-orange-600" />
                <span>{file.filename}</span>
              </button>
            );
          })}
        </div>

        {/* Active file viewer */}
        <div className="mt-6 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="bg-slate-50 dark:bg-slate-800/50 px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {activeFile.title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {activeFile.description}
              </p>
            </div>
            <button
              onClick={() => handleCopy(activeFile.code, activeFile.id)}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 self-start sm:self-auto whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedId === activeFile.id ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
                  <span>Codice Copiato</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copia {activeFile.filename}</span>
                </>
              )}
            </button>
          </div>

          <pre className="p-5 bg-slate-950 text-slate-100 text-xs leading-relaxed overflow-x-auto font-mono-tabular">
            <code>{activeFile.code}</code>
          </pre>
        </div>
      </div>

      {/* Quick Android Studio Setup steps */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
        <div className="flex items-center gap-2.5 text-slate-900 dark:text-white font-semibold text-base">
          <Terminal className="w-5 h-5 text-orange-600 shrink-0" />
          <h3>Come compilare l&apos;APK in Android Studio</h3>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-slate-600 dark:text-slate-300">
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">01. Nuovo Progetto</p>
            <p className="mt-1 text-xs leading-relaxed">
              Crea un progetto <strong>Empty Activity (Jetpack Compose)</strong> in Android Studio con package <code>com.cronotri.app</code>.
            </p>
          </div>
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">02. Incolla i Moduli</p>
            <p className="mt-1 text-xs leading-relaxed">
              Aggiungi le dipendenze Room in <code>build.gradle.kts</code> e copia i file <code>MeasurementDatabase.kt</code>, <code>ChronometerViewModel.kt</code> e <code>MainActivity.kt</code>.
            </p>
          </div>
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">03. Esegui su Dispositivo</p>
            <p className="mt-1 text-xs leading-relaxed">
              Avvia il build su emulatore o smartphone Android via USB: il database SQLite locale salverà tutte le sessioni sul telefono.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

# Qisas

An offline digital reading application for two classical Islamic books:

1. **Stories of the Prophets** by Ibn Kathir
2. **Companions of the Prophet**

Qisas preserves the original PDF content exactly as-is and provides comfortable navigation, bookmarks, search, reading progress tracking, and theme customization.

## Features

- **Offline-first** — works completely without internet after installation
- **Original content preservation** — PDFs are displayed as-is, no rewriting or modification
- **Structured navigation** — browse prophets and companions by their actual book headings
- **Reading progress** — automatically saves your position; resume from Last Read
- **Bookmarks** — save important locations and return to them
- **Search** — find words and phrases across both books
- **Themes** — Light, Warm, and Dark reading themes
- **Zoom controls** — adjustable text/page size
- **Cross-platform** — Windows installer (.exe) and Android APK

## Installation

### Windows

1. Download `Qisas_Setup_v1.0.0.exe` from the `dist-installer/` folder
2. Run the installer and follow the prompts
3. Launch Qisas from the Start Menu or Desktop shortcut

### Android

1. Download `Qisas.apk` from the `dist-android/` folder
2. Transfer to your Android device
3. Enable "Install from unknown sources" in Settings → Security
4. Open the APK file to install
5. Launch Qisas from the app drawer

## Project Structure

```
Qisas/
├── app/                        # Web application (HTML/CSS/JS)
│   ├── index.html              # Main application UI
│   ├── css/styles.css          # Styling with 3 themes
│   ├── js/
│   │   ├── app.js              # Core application logic
│   │   ├── prophets-data.js    # Prophets catalog data
│   │   ├── companions-data.js  # Companions catalog data
│   │   └── search-data.js      # Search index data
│   ├── pdfjs/                  # PDF.js library for rendering
│   └── assets/                 # PDFs and icons
├── android_build/              # Android project source
│   ├── AndroidManifest.xml
│   ├── java/                   # MainActivity.java
│   └── res/                    # Icons, strings, styles
├── main.py                     # Windows desktop app (pywebview)
├── installer.iss               # Inno Setup installer script
├── build_android.py            # Android APK build script
├── dist-installer/             # Windows installer output
│   └── Qisas_Setup_v1.0.0.exe
└── dist-android/               # Android APK output
    └── Qisas.apk
```

## Building from Source

### Prerequisites

- Python 3.10+ with `pywebview` and `pyinstaller`
- JDK 17
- Android SDK (build-tools 34.0.0, platform android-34)
- Inno Setup 6 (for Windows installer)

### Windows Build

```bash
# Install dependencies
pip install pywebview pyinstaller pillow

# Build executable
pyinstaller --name Qisas --windowed --icon=build_resources/icon.ico --add-data "app;app" main.py

# Build installer (requires Inno Setup)
iscc installer.iss
```

### Android Build

```bash
# Set up tools (JDK 17 + Android SDK) in tools/ directory
# Then run:
python build_android.py
```

## Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (vanilla)
- **PDF Rendering**: PDF.js 3.11.174
- **Windows Desktop**: pywebview (WebView2 backend)
- **Android**: WebView-based Activity
- **Windows Installer**: Inno Setup 6
- **Data Storage**: localStorage (offline, no server required)

## License

This application is a reader for the provided PDF books. The books' content belongs to their respective authors and publishers.

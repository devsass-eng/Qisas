"""
Android APK Build Script for Qisas
Compiles Java → DEX → AAPT2 → APK → Sign → Align
"""
import os
import sys
import shutil
import subprocess

# Fix Windows console encoding
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# ── Paths ──
PROJECT = r'C:\Users\Devsass\Desktop\Qisas'
ANDROID_BUILD = os.path.join(PROJECT, 'android_build')
APP_SRC = os.path.join(PROJECT, 'app')
OUTPUT_DIR = os.path.join(PROJECT, 'dist-android')

# SDK / JDK paths
SDK = os.path.join(PROJECT, 'tools', 'android-sdk')
JDK = os.path.join(PROJECT, 'tools', 'jdk', 'jdk-17.0.12+7')
BUILD_TOOLS = os.path.join(SDK, 'build-tools', '34.0.0')
PLATFORM = os.path.join(SDK, 'platforms', 'android-34')

ANDROID_JAR = os.path.join(PLATFORM, 'android.jar')
AAPT2 = os.path.join(BUILD_TOOLS, 'aapt2.exe')
D8 = os.path.join(BUILD_TOOLS, 'd8.bat')
ZIPALIGN = os.path.join(BUILD_TOOLS, 'zipalign.exe')
APKSIGNER = os.path.join(BUILD_TOOLS, 'apksigner.bat')
JAVAC = os.path.join(JDK, 'bin', 'javac.exe')
KEYTOOL = os.path.join(JDK, 'bin', 'keytool.exe')
JAR_TOOL = os.path.join(JDK, 'bin', 'jar.exe')

# Build intermediaries
BUILD_DIR = os.path.join(ANDROID_BUILD, 'build')
CLASSES_DIR = os.path.join(BUILD_DIR, 'classes')
RES_COMPILED_DIR = os.path.join(BUILD_DIR, 'res-compiled')
GEN_DIR = os.path.join(BUILD_DIR, 'gen')
ASSETS_DIR = os.path.join(ANDROID_BUILD, 'assets')
KEYSTORE = os.path.join(BUILD_DIR, 'debug.keystore')

def run(cmd, desc="", shell=False):
    print(f'\n{"="*60}')
    print(f'  {desc}')
    print(f'{"="*60}')
    print(f'  CMD: {cmd if isinstance(cmd, str) else " ".join(cmd)}')
    result = subprocess.run(
        cmd, shell=shell, capture_output=True, text=True,
        env={**os.environ, 'JAVA_HOME': JDK, 'PATH': os.path.join(JDK, 'bin') + ';' + os.environ.get('PATH', '')}
    )
    if result.stdout:
        print(result.stdout[:2000])
    if result.stderr:
        print(f'STDERR: {result.stderr[:2000]}')
    if result.returncode != 0:
        print(f'ERROR: Command failed with code {result.returncode}')
        sys.exit(1)
    return result

def main():
    print('='*60)
    print('  Qisas Android APK Builder')
    print('='*60)

    # Verify tools exist
    for tool, path in [('AAPT2', AAPT2), ('D8', D8), ('ZIPALIGN', ZIPALIGN),
                        ('APKSIGNER', APKSIGNER), ('JAVAC', JAVAC),
                        ('ANDROID_JAR', ANDROID_JAR)]:
        if not os.path.exists(path):
            print(f'ERROR: {tool} not found at {path}')
            sys.exit(1)
        print(f'  ✓ {tool}: {path}')

    # Clean build directory
    if os.path.exists(BUILD_DIR):
        shutil.rmtree(BUILD_DIR)
    os.makedirs(CLASSES_DIR, exist_ok=True)
    os.makedirs(RES_COMPILED_DIR, exist_ok=True)
    os.makedirs(GEN_DIR, exist_ok=True)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # ── Step 1: Copy app assets ──
    print('\n\n>>> Step 1: Copying web app to android assets...')
    if os.path.exists(ASSETS_DIR):
        shutil.rmtree(ASSETS_DIR)
    shutil.copytree(APP_SRC, ASSETS_DIR)
    print(f'  Copied {APP_SRC} → {ASSETS_DIR}')

    # ── Step 2: Compile resources with AAPT2 ──
    run(
        [AAPT2, 'compile', '--dir', os.path.join(ANDROID_BUILD, 'res'), '-o', RES_COMPILED_DIR],
        'Step 2: Compiling Android resources with AAPT2'
    )

    # Collect compiled .flat files
    flat_files = []
    for root, dirs, files in os.walk(RES_COMPILED_DIR):
        for f in files:
            if f.endswith('.flat'):
                flat_files.append(os.path.join(root, f))
    print(f'  Found {len(flat_files)} compiled resource files')

    # ── Step 3: Link resources and generate R.java ──
    link_apk = os.path.join(BUILD_DIR, 'res-linked.apk')
    link_cmd = [
        AAPT2, 'link',
        '-I', ANDROID_JAR,
        '--manifest', os.path.join(ANDROID_BUILD, 'AndroidManifest.xml'),
        '-o', link_apk,
        '--java', GEN_DIR,
        '--auto-add-overlay',
    ]
    for f in flat_files:
        link_cmd.extend(['-R', f])

    run(link_cmd, 'Step 3: Linking resources and generating R.java')

    # Verify R.java was generated
    r_java = os.path.join(GEN_DIR, 'com', 'qisas', 'app', 'R.java')
    if not os.path.exists(r_java):
        print(f'ERROR: R.java not found at {r_java}')
        # Try to find it
        for root, dirs, files in os.walk(GEN_DIR):
            for f in files:
                print(f'  Found: {os.path.join(root, f)}')
        sys.exit(1)
    print(f'  ✓ R.java generated at {r_java}')

    # ── Step 4: Compile Java source ──
    java_files = [
        os.path.join(ANDROID_BUILD, 'java', 'com', 'qisas', 'app', 'MainActivity.java'),
        r_java
    ]
    run(
        [JAVAC, '-source', '1.8', '-target', '1.8',
         '-classpath', ANDROID_JAR,
         '-d', CLASSES_DIR,
         '-bootclasspath', ANDROID_JAR] + java_files,
        'Step 4: Compiling Java source'
    )

    # ── Step 5: Convert to DEX ──
    # Collect all .class files
    class_files = []
    for root, dirs, files in os.walk(CLASSES_DIR):
        for f in files:
            if f.endswith('.class'):
                class_files.append(os.path.join(root, f))
    print(f'\n  Found {len(class_files)} .class files')

    dex_output = os.path.join(BUILD_DIR, 'classes.dex')
    run(
        [D8, '--output', BUILD_DIR, '--lib', ANDROID_JAR] + class_files,
        'Step 5: Converting to DEX with D8'
    )

    if not os.path.exists(dex_output):
        print(f'ERROR: DEX file not found at {dex_output}')
        for f in os.listdir(BUILD_DIR):
            print(f'  {f}')
        sys.exit(1)
    print(f'  ✓ DEX generated: {dex_output}')

    # ── Step 6: Build unsigned APK ──
    # Start with the linked resources APK and add DEX + assets
    unsigned_apk = os.path.join(BUILD_DIR, 'qisas-unsigned.apk')
    shutil.copy2(link_apk, unsigned_apk)

    # Use Python's zipfile to add DEX and assets
    import zipfile

    with zipfile.ZipFile(unsigned_apk, 'a', zipfile.ZIP_DEFLATED) as zf:
        # Add classes.dex
        zf.write(dex_output, 'classes.dex')
        print(f'  Added classes.dex')

        # Add all assets
        asset_count = 0
        for root, dirs, files in os.walk(ASSETS_DIR):
            for f in files:
                full_path = os.path.join(root, f)
                arcname = 'assets/' + os.path.relpath(full_path, ASSETS_DIR).replace('\\', '/')
                # Use ZIP_STORED for PDFs (already compressed) and large files
                if f.endswith('.pdf') or f.endswith('.png') or f.endswith('.jpg'):
                    zf.write(full_path, arcname, compress_type=zipfile.ZIP_STORED)
                else:
                    zf.write(full_path, arcname)
                asset_count += 1
        print(f'  Added {asset_count} asset files')

    print(f'  ✓ Unsigned APK: {unsigned_apk}')

    # ── Step 7: Generate debug keystore ──
    if not os.path.exists(KEYSTORE):
        run(
            [KEYTOOL, '-genkey', '-v',
             '-keystore', KEYSTORE,
             '-storepass', 'android',
             '-alias', 'androiddebugkey',
             '-keypass', 'android',
             '-keyalg', 'RSA',
             '-keysize', '2048',
             '-validity', '10000',
             '-dname', 'CN=Debug,OU=Debug,O=Debug,L=Debug,ST=Debug,C=US'],
            'Step 7: Generating debug keystore'
        )
    print(f'  ✓ Keystore: {KEYSTORE}')

    # ── Step 8: Align the APK ──
    aligned_apk = os.path.join(BUILD_DIR, 'qisas-aligned.apk')
    run(
        [ZIPALIGN, '-f', '-p', '4', unsigned_apk, aligned_apk],
        'Step 8: Aligning APK with zipalign'
    )
    print(f'  ✓ Aligned APK: {aligned_apk}')

    # ── Step 9: Sign the APK ──
    final_apk = os.path.join(OUTPUT_DIR, 'Qisas.apk')
    shutil.copy2(aligned_apk, final_apk)

    run(
        [APKSIGNER, 'sign',
         '--ks', KEYSTORE,
         '--ks-pass', 'pass:android',
         '--ks-key-alias', 'androiddebugkey',
         '--key-pass', 'pass:android',
         final_apk],
        'Step 9: Signing APK'
    )
    print(f'  ✓ Signed APK: {final_apk}')

    # ── Step 10: Verify ──
    run(
        [APKSIGNER, 'verify', '--verbose', final_apk],
        'Step 10: Verifying APK signature'
    )

    apk_size = os.path.getsize(final_apk)
    print(f'\n{"="*60}')
    print(f'  BUILD SUCCESSFUL!')
    print(f'  APK: {final_apk}')
    print(f'  Size: {apk_size / (1024*1024):.1f} MB')
    print(f'{"="*60}')

if __name__ == '__main__':
    main()

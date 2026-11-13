import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

type BackupExportOptions = {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  filterName: string;
  extensions: string[];
};

function getDesktopApi() {
  if (typeof window === 'undefined' || !window.libraryDesktop?.isElectron) {
    return null;
  }
  return window.libraryDesktop;
}

export async function saveBackupFile({
  bytes,
  fileName,
  mimeType,
  filterName,
  extensions,
}: BackupExportOptions): Promise<boolean> {
  const base64 = Buffer.from(bytes).toString('base64');
  const desktop = getDesktopApi();
  if (Platform.OS === 'web' && desktop) {
    return Boolean(
      await desktop.saveFile({
        defaultPath: fileName,
        filters: [{ name: filterName, extensions }],
        data: base64,
        encoding: 'base64',
      })
    );
  }
  if (Platform.OS === 'web') {
    if (typeof document === 'undefined') {
      throw new Error('File downloads are unavailable in this browser context.');
    }
    const link = document.createElement('a');
    link.href = `data:${mimeType};base64,${base64}`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  }
  const directory = FileSystem.cacheDirectory;
  if (!directory) {
    throw new Error('The device cache directory is unavailable.');
  }
  const uri = `${directory}${fileName}`;
  try {
    await FileSystem.writeAsStringAsync(uri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error('The device does not have a compatible app for sharing files.');
    }
    await Sharing.shareAsync(uri, { dialogTitle: fileName, mimeType });
    return true;
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
}

import type {Track} from '../types';

export type SavedTrack = Omit<Track, 'url'> & {source: string | Blob};

export interface SavedPlaylists {
  active: string;
  lists: {name: string; tracks: SavedTrack[]}[];
}

let database: Promise<IDBDatabase> | undefined;

function openDatabase() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('listenoop-playlists', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('library');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}

export async function loadPlaylists(): Promise<SavedPlaylists | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction('library')
      .objectStore('library')
      .get('playlists');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePlaylists(playlists: SavedPlaylists): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('library', 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.objectStore('library').put(playlists, 'playlists');
  });
}

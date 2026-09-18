const DATABASE_NAME = "structor-workspace";
const DATABASE_VERSION = 1;
const WORKSPACE_STORE = "workspaces";
const FILE_STORE = "files";
const ACTIVE_WORKSPACE_KEY = "active";
const ACTIVE_WORKBOOK_KEY = "active-workbook";

export const WORKSPACE_SCHEMA_VERSION = 1;

export type WorkspaceState<Project, Item, Bidder> = {
  project: Project;
  items: Item[];
  bidders: Bidder[];
};

export type LoadedWorkspace<Project, Item, Bidder> = WorkspaceState<Project, Item, Bidder> & {
  savedAt: string;
  originalWorkbook?: ArrayBuffer;
};

export type WorkspaceStorageErrorCode =
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_QUOTA_EXCEEDED"
  | "STORAGE_CORRUPT"
  | "STORAGE_VERSION_UNSUPPORTED"
  | "STORAGE_READ_FAILED"
  | "STORAGE_SAVE_FAILED"
  | "STORAGE_CLEAR_FAILED";

export class WorkspaceStorageError extends Error {
  constructor(
    public readonly code: WorkspaceStorageErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "WorkspaceStorageError";
  }
}

type StoredWorkspace = {
  key: typeof ACTIVE_WORKSPACE_KEY;
  schemaVersion: number;
  savedAt: string;
  state: WorkspaceState<unknown, unknown, unknown>;
  workbookKey?: typeof ACTIVE_WORKBOOK_KEY;
};

type StoredWorkbook = {
  key: typeof ACTIVE_WORKBOOK_KEY;
  schemaVersion: number;
  bytes: ArrayBuffer;
};

let databasePromise: Promise<IDBDatabase> | undefined;

function storageError(code: WorkspaceStorageErrorCode, cause?: unknown) {
  const messages: Record<WorkspaceStorageErrorCode, string> = {
    STORAGE_UNAVAILABLE: "Local workspace storage is unavailable in this browser. Export a backup before leaving this page.",
    STORAGE_QUOTA_EXCEEDED: "The workspace could not be saved because browser storage is full. Export a backup, then free browser storage.",
    STORAGE_CORRUPT: "The saved workspace is damaged and could not be restored. Export any available backup, then clear the saved workspace.",
    STORAGE_VERSION_UNSUPPORTED: "This saved workspace was created by an incompatible app version and cannot be opened safely.",
    STORAGE_READ_FAILED: "The saved workspace could not be loaded. Retry before replacing it or leaving this page.",
    STORAGE_SAVE_FAILED: "The workspace could not be saved. Export a backup before leaving this page.",
    STORAGE_CLEAR_FAILED: "The saved workspace could not be cleared. Retry or clear this site's storage in the browser.",
  };
  return new WorkspaceStorageError(code, messages[code], cause === undefined ? undefined : { cause });
}

function mapStorageError(error: unknown, fallback: WorkspaceStorageErrorCode) {
  if (error instanceof WorkspaceStorageError) return error;
  if (error instanceof DOMException) {
    if (error.name === "QuotaExceededError") return storageError("STORAGE_QUOTA_EXCEEDED", error);
    if (error.name === "SecurityError" || error.name === "InvalidStateError") {
      return storageError("STORAGE_UNAVAILABLE", error);
    }
  }
  return storageError(fallback, error);
}

function openDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(storageError("STORAGE_UNAVAILABLE"));
  }
  databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    let abandoned = false;
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(WORKSPACE_STORE)) database.createObjectStore(WORKSPACE_STORE, { keyPath: "key" });
      if (!database.objectStoreNames.contains(FILE_STORE)) database.createObjectStore(FILE_STORE, { keyPath: "key" });
    };
    request.onerror = () => reject(request.error ?? storageError("STORAGE_UNAVAILABLE"));
    request.onblocked = () => {
      abandoned = true;
      reject(storageError("STORAGE_UNAVAILABLE"));
    };
    request.onsuccess = () => {
      const database = request.result;
      if (abandoned) {
        database.close();
        return;
      }
      database.onversionchange = () => {
        database.close();
        databasePromise = undefined;
      };
      database.onclose = () => { databasePromise = undefined; };
      resolve(database);
    };
  }).catch((error) => {
    databasePromise = undefined;
    throw mapStorageError(error, "STORAGE_UNAVAILABLE");
  });
  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(transaction.error);
  });
}

async function runTransaction<T>(transaction: IDBTransaction, action: () => Promise<T>): Promise<T> {
  const complete = transactionComplete(transaction);
  try {
    const result = await action();
    await complete;
    return result;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // The browser may already have completed or aborted the transaction.
    }
    await complete.catch(() => undefined);
    throw error;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateWorkspaceRecord(value: unknown): asserts value is StoredWorkspace {
  if (!isObject(value) || value.key !== ACTIVE_WORKSPACE_KEY || typeof value.schemaVersion !== "number") {
    throw storageError("STORAGE_CORRUPT");
  }
  if (value.schemaVersion !== WORKSPACE_SCHEMA_VERSION) throw storageError("STORAGE_VERSION_UNSUPPORTED");
  const state = value.state;
  if (!isObject(state) || !isObject(state.project) || !Array.isArray(state.items) || !Array.isArray(state.bidders) || typeof value.savedAt !== "string") {
    throw storageError("STORAGE_CORRUPT");
  }
  if (value.workbookKey !== undefined && value.workbookKey !== ACTIVE_WORKBOOK_KEY) throw storageError("STORAGE_CORRUPT");
}

function validateWorkbookRecord(value: unknown): asserts value is StoredWorkbook {
  if (!isObject(value) || value.key !== ACTIVE_WORKBOOK_KEY || typeof value.schemaVersion !== "number") {
    throw storageError("STORAGE_CORRUPT");
  }
  if (value.schemaVersion !== WORKSPACE_SCHEMA_VERSION) throw storageError("STORAGE_VERSION_UNSUPPORTED");
  if (!(value.bytes instanceof ArrayBuffer)) throw storageError("STORAGE_CORRUPT");
}

const forbiddenCredentialKey = /^(?:access|refresh|id|oauth)?_?token$|^(?:client|session)_?secret$/i;

function rejectCredentialFields(value: unknown, seen = new Set<object>()) {
  if (!isObject(value) || value instanceof ArrayBuffer || seen.has(value)) return;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenCredentialKey.test(key)) {
      throw storageError("STORAGE_SAVE_FAILED", new Error(`Credential field ${key} is not allowed in browser workspace storage.`));
    }
    rejectCredentialFields(child, seen);
  }
}

export async function loadWorkspace<Project, Item, Bidder>(): Promise<LoadedWorkspace<Project, Item, Bidder> | null> {
  try {
    const database = await openDatabase();
    const transaction = database.transaction([WORKSPACE_STORE, FILE_STORE], "readonly");
    return await runTransaction(transaction, async () => {
      const record: unknown = await requestResult(transaction.objectStore(WORKSPACE_STORE).get(ACTIVE_WORKSPACE_KEY));
      if (record === undefined) return null;
      validateWorkspaceRecord(record);
      let originalWorkbook: ArrayBuffer | undefined;
      if (record.workbookKey) {
        const workbook: unknown = await requestResult(transaction.objectStore(FILE_STORE).get(record.workbookKey));
        validateWorkbookRecord(workbook);
        originalWorkbook = workbook.bytes.slice(0);
      }
      return {
        ...(record.state as WorkspaceState<Project, Item, Bidder>),
        savedAt: record.savedAt,
        originalWorkbook,
      };
    });
  } catch (error) {
    throw mapStorageError(error, "STORAGE_READ_FAILED");
  }
}

export async function saveWorkspace<Project, Item, Bidder>(
  state: WorkspaceState<Project, Item, Bidder>,
  originalWorkbook?: ArrayBuffer,
): Promise<{ savedAt: string }> {
  if (!isObject(state) || !isObject(state.project) || !Array.isArray(state.items) || !Array.isArray(state.bidders)) {
    throw storageError("STORAGE_SAVE_FAILED", new TypeError("Workspace state must contain a project, items, and bidders."));
  }
  const persistedState: WorkspaceState<Project, Item, Bidder> = {
    project: state.project,
    items: state.items,
    bidders: state.bidders,
  };
  rejectCredentialFields(persistedState);
  if (originalWorkbook !== undefined && !(originalWorkbook instanceof ArrayBuffer)) {
    throw storageError("STORAGE_SAVE_FAILED", new TypeError("originalWorkbook must be an ArrayBuffer."));
  }

  try {
    const database = await openDatabase();
    const transaction = database.transaction([WORKSPACE_STORE, FILE_STORE], "readwrite");
    return await runTransaction(transaction, async () => {
      const workspaceStore = transaction.objectStore(WORKSPACE_STORE);
      const current: unknown = await requestResult(workspaceStore.get(ACTIVE_WORKSPACE_KEY));
      if (current !== undefined) validateWorkspaceRecord(current);

      const savedAt = new Date().toISOString();
      const workbookKey = originalWorkbook !== undefined
        ? ACTIVE_WORKBOOK_KEY
        : (current as StoredWorkspace | undefined)?.workbookKey;

      if (originalWorkbook !== undefined) {
        await requestResult(transaction.objectStore(FILE_STORE).put({
          key: ACTIVE_WORKBOOK_KEY,
          schemaVersion: WORKSPACE_SCHEMA_VERSION,
          bytes: originalWorkbook.slice(0),
        } satisfies StoredWorkbook));
      }

      await requestResult(workspaceStore.put({
        key: ACTIVE_WORKSPACE_KEY,
        schemaVersion: WORKSPACE_SCHEMA_VERSION,
        savedAt,
        state: persistedState,
        ...(workbookKey ? { workbookKey } : {}),
      } satisfies StoredWorkspace));
      return { savedAt };
    });
  } catch (error) {
    throw mapStorageError(error, "STORAGE_SAVE_FAILED");
  }
}

export async function clearWorkspace(): Promise<void> {
  try {
    const database = await openDatabase();
    const transaction = database.transaction([WORKSPACE_STORE, FILE_STORE], "readwrite");
    await runTransaction(transaction, async () => {
      transaction.objectStore(WORKSPACE_STORE).delete(ACTIVE_WORKSPACE_KEY);
      transaction.objectStore(FILE_STORE).delete(ACTIVE_WORKBOOK_KEY);
    });
  } catch (error) {
    throw mapStorageError(error, "STORAGE_CLEAR_FAILED");
  }
}

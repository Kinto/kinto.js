export function attachFakeIDBSymbolsTo(obj) {
  if (typeof obj.indexedDB === "object") {
    return;
  }
  const iDBSymbols = [
    "IDBTransaction",
    "IDBObjectStore",
    "IDBIndex",
    "IDBCursor",
    "IDBCursorWithValue",
    "IDBKeyRange",
  ];
  iDBSymbols.forEach(symbol => {
    let fakeSymbol = symbol.replace("IDB", "FDB");
    obj[symbol] = require(`fake-indexeddb/lib/${fakeSymbol}`);
  })
  obj.indexedDB = require("fake-indexeddb");
}

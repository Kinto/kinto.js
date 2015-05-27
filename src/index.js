"use strict";

import Collection from "./collection";

export default class Cliquetis {
  constructor(options = {}) {
    this._options = options;
    this._collections = {};
  }

  collection(collName) {
    if (!collName)
      throw new Error("missing collection name");
    return new Collection(collName);
  }
}

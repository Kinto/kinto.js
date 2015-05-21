export class Collection {
  constructor(name) {
    this._name = name;
  }
}

export class Cliquet {
  constructor(bucket) {
    this._bucket = bucket;
  }

  collection(name) {
    return new Collection(name);
  }
}

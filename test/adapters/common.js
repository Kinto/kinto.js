"use strict";

import sinon from "sinon";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { v4 as uuid4 } from "uuid";

chai.use(chaiAsPromised);
chai.should();
chai.config.includeStack = true;

export function adapterTestSuite(createDB, options={only: false}) {
  const testFn = options["only"] ? describe["only"] : describe;
  testFn("Common adapter tests", () => {
    let sandbox, db;

    beforeEach(() => {
      sandbox = sinon.sandbox.create();
      db = createDB();
      return db.clear();
    });

    afterEach(() => sandbox.restore());

    describe("#create", () => {
      it("should save a record", () => {
        const data = {id: 1, foo: "bar"};
        return db.create(data)
          .then(data => db.list())
          .should.become([data]);
      });
    });

    describe("#update", () => {
      it("should update a record", () => {
        const data = {id: 1, foo: "bar"};
        return db.create(data)
          .then(res => db.get(res.id))
          .then(existing => {
            return db.update(Object.assign({}, existing, {foo: "baz"}));
          })
          .then(res => db.get(res.id))
          .then(res => res.foo)
          .should.become("baz");
      });
    });

    describe("#get", () => {
      let id;

      beforeEach(() => {
        return db.create({id: 1, foo: "bar"})
          .then(res => id = res.id);
      });

      it("should retrieve a record from its id", () => {
        return db.get(id)
          .then(res => res.foo)
          .should.eventually.eql("bar");
      });

      it("should return undefined when record is not found", () => {
        return db.get(999)
          .should.eventually.eql(undefined);
      });
    });

    describe("#delete", () => {
      let id;

      beforeEach(() => {
        return db.create({id: 1, foo: "bar"})
          .then(res => id = res.id);
      });

      it("should delete a record", () => {
        return db.delete(id)
          .then(res => db.get(id))
          .should.eventually.become(undefined);
      });

      it("should resolve with deleted id", () => {
        return db.delete(id)
          .should.eventually.eql(id);
      });

      it("should silently fail at deleting a non-existent record id", () => {
        return db.delete(999)
          .should.eventually.eql(999);
      });
    });

    describe("#list", () => {
      beforeEach(() => {
        return Promise.all([
          db.create({id: 1, foo: "bar"}),
          db.create({id: 2, foo: "baz"}),
        ]);
      });

      it("should retrieve the list of records", () => {
        return db.list()
          .should.eventually.eql([
            {id: 1, foo: "bar"},
            {id: 2, foo: "baz"},
          ]);
      });
    });

    describe("#saveLastModified", () => {
      it("should resolve with lastModified value", () => {
        return db.saveLastModified(42)
          .should.eventually.become(42);
      });

      it("should save a lastModified value", () => {
        return db.saveLastModified(42)
          .then(_ => db.getLastModified())
          .should.eventually.become(42);
      });

      it("should allow updating previous value", () => {
        return db.saveLastModified(42)
          .then(_ => db.saveLastModified(43))
          .then(_ => db.getLastModified())
          .should.eventually.become(43);
      });
    });

    describe("#loadDump", () => {
      it("should import a list of records.", () => {
        return db.loadDump([
            {id: 1, foo: "bar"},
            {id: 2, foo: "baz"},
        ])
        .should.eventually.have.length(2);
      });

      it("should override existing records.",  () => {
        return db.loadDump([
            {id: 1, foo: "bar"},
            {id: 2, foo: "baz"},
        ])
        .then(() => {
          return db.loadDump([
            {id: 1, foo: "baz"},
            {id: 3, foo: "bab"},
          ]);
        })
        .then(() => db.list())
        .should.eventually.eql([
            {id: 1, foo: "baz"},
            {id: 2, foo: "baz"},
            {id: 3, foo: "bab"},
        ]);
      });

      it("should update the collection lastModified value.", () => {
        return db.loadDump([
          {id: uuid4(), title: "foo", last_modified: 1457896541},
          {id: uuid4(), title: "bar", last_modified: 1458796542},
        ])
          .then(() => db.getLastModified())
          .should.eventually.become(1458796542);
      });

      it("should preserve older collection lastModified value.", () => {
        return db.saveLastModified(1458796543)
          .then(() => db.loadDump([
            {id: uuid4(), title: "foo", last_modified: 1457896541},
            {id: uuid4(), title: "bar", last_modified: 1458796542},
          ]))
          .then(() => db.getLastModified())
          .should.eventually.become(1458796543);
      });
    });
  });
}

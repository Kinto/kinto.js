import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import wd from "wd";

chai.use(chaiAsPromised);
chai.should();
chai.config.includeStack = true;

describe("Demo app", () => {
  var browser;

  before(() => {
    browser = wd.promiseChainRemote();
    return browser.init({browserName: "chrome"});
  });

  beforeEach(() => browser.get("http://localhost:8080/"));

  after(() => browser.quit());

  it("should retrieve the page title", () => {
    return browser.title().should.become("Cliquetis demo");
  });
});

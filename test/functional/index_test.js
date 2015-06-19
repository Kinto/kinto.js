import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import wd from "wd";

chai.use(chaiAsPromised);
chai.should();
chai.config.includeStack = true;

describe("using promises and chai-as-promised", () => {
  var browser;

  before(() => {
    browser = wd.promiseChainRemote();
    return browser.init({browserName: "chrome"});
  });

  beforeEach(() => {
    return browser.get("http://admc.io/wd/test-pages/guinea-pig.html");
  });

  after(() => {
    return browser.quit();
  });

  it("should retrieve the page title", () => {
    return browser.title().should.become("WD Tests");
  });

  it("submit element should be clicked", () => {
    return browser.elementById("submit").click().eval("window.location.href")
      .should.eventually.include("&submit");
  });
});

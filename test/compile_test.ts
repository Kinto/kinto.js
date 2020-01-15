import Kinto from "../src";

interface Article {
  id: string;
  title: string;
  _status?: string;
}

(async () => {
  const db = new Kinto();
  const articles = db.collection("articles");
  const record = await articles.create({ title: "foo" });
  console.log(record.data.title);
  console.log(record.data._status);

  const existingRecord = await articles.get("123");
  console.log(existingRecord.data.id);

  const existingRecordWithGeneric = await articles.get("123");
  console.log(
    existingRecordWithGeneric.data.id,
    existingRecordWithGeneric.data.title
  );

  const possibleRecord = await articles.getAny("123");
  console.log(possibleRecord.data && possibleRecord.data.id);

  const updateResponse = await articles.update({
    ...record.data,
    title: "hello!",
  });
  console.log(updateResponse.data.title, updateResponse.oldRecord.title);

  const typedArticles = db.collection<Article>("typedArticles");
  const createdArticle = await typedArticles.create({ title: "" });
  console.log(createdArticle.data.title);

  const existingArticle = await typedArticles.get("123");
  console.log(existingArticle.data.title);

  const possibleArticle = await typedArticles.getAny("123");
  console.log(possibleArticle.data && possibleArticle.data.title);

  const updateTypedResponse = await typedArticles.update({
    ...createdArticle.data,
    title: "hello",
  });
  console.log(
    updateTypedResponse.data.title,
    updateTypedResponse.oldRecord.title
  );

  const typedUpsert = await typedArticles.upsert({
    id: "123",
    title: "helloThere",
  });
  console.log(typedUpsert.oldRecord && typedUpsert.oldRecord.title);
  console.log(typedUpsert.oldRecord && typedUpsert.data._status);

  const typedDeleteAny = await typedArticles.deleteAny("123");
  console.log(typedDeleteAny.deleted);

  const typedList = await typedArticles.list();
  typedList.data.forEach(a => {
    console.log(a.title);
  });

  const typedDeletedList = await typedArticles.deleteAll();
  typedDeletedList.data.forEach(a => {
    console.log(a.title);
  });

  const typedClear = await articles.clear();
  console.log(typedClear.data.length);
})();

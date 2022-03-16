export default function Blob(
  dataArray: WithImplicitCoercion<ArrayBuffer | SharedArrayBuffer>[]
) {
  return Buffer.from(dataArray[0]);
}

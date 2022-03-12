/**
 * Endpoints templates.
 * @type {Object}
 */
const ENDPOINTS = {
  root: () => "/",
  batch: () => "/batch",
  permissions: () => "/permissions",
  bucket: (bucket?: string) => "/buckets" + (bucket ? `/${bucket}` : ""),
  history: (bucket: string) => `${ENDPOINTS.bucket(bucket)}/history`,
  collection: (bucket: string, coll?: string) =>
    `${ENDPOINTS.bucket(bucket)}/collections` + (coll ? `/${coll}` : ""),
  group: (bucket: string, group?: string) =>
    `${ENDPOINTS.bucket(bucket)}/groups` + (group ? `/${group}` : ""),
  record: (bucket: string, coll: string, id?: string) =>
    `${ENDPOINTS.collection(bucket, coll)}/records` + (id ? `/${id}` : ""),
  attachment: (bucket: string, coll: string, id: string) =>
    `${ENDPOINTS.record(bucket, coll, id)}/attachment`,
};

export default ENDPOINTS;

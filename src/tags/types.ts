export type Tag = {
  id: string;
  name: string;
};

export type DataSourceTags = {
  tagsDataSourceId: string;
  tags: Tag[];
};

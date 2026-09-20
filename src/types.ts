export type DataSource = {
  id: string;
  title: string;
};

export type Tag = {
  id: string;
  name: string;
};

export type DataSourceTags = {
  tagsDataSourceId: string;
  tags: Tag[];
};

export type Bookmark = {
  id: string;
  title: string;
  url: string | null;
  notionUrl: string;
  dataSourceId: string;
  dataSourceTitle: string;
  lastEditedTime: string;
  tags: string[];
  tagIds: string[];
  searchText: string;
};

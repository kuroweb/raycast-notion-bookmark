export type DataSource = {
  id: string;
  title: string;
};

export type Bookmark = {
  id: string;
  title: string;
  url: string | null;
  notionUrl: string;
  dataSourceId: string;
  dataSourceTitle: string;
  lastEditedTime: string;
  searchText: string;
};

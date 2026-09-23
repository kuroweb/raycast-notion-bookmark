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

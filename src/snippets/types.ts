export type Snippet = {
  id: string;
  title: string;
  body: string;
  truncated: boolean;
  dataSourceId: string;
  dataSourceTitle: string;
  lastEditedTime: string;
  tags: string[];
  searchText: string;
};

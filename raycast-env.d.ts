/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Notion Personal Access Token - Personal access token from Notion developer tools (app.notion.com/developers). It uses your workspace permissions. */
  "notionToken": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `search-bookmarks` command */
  export type SearchBookmarks = ExtensionPreferences & {}
  /** Preferences accessible in the `configure-databases` command */
  export type ConfigureDatabases = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `search-bookmarks` command */
  export type SearchBookmarks = {}
  /** Arguments passed to the `configure-databases` command */
  export type ConfigureDatabases = {}
}


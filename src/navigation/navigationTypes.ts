
export enum NavigationTypeEnumeration {
  View,
  Dialog
};

export interface INavigationElement {
  key: string;
  name: string;
  importPath: string;
  type: NavigationTypeEnumeration;
  Icon?: React.FunctionComponent<Record<string, never>> | React.ComponentType<Record<string, never>> | string;
};

export type INavigationElementProps = Record<string, never>;

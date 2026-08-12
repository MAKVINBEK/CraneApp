export interface IUserDto {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  bio: string;
} // TODO: дописать

export interface ISettingsDto {
  language: string;
  theme: 'dark' | 'light';
  notifications: boolean;
  sounds: boolean;
}

export interface ISearchUserDto {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  avatarUrl: string;
}

export type ISearchUsersList = ISearchUserDto[];

export interface ISearchUsersResponse {
  users: ISearchUsersList;
}

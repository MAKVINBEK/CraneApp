export interface IUserDto {
  id: string;
  firstName: string;
} // TODO: дописать

export interface ISettingsDto {
  language: string;
  theme: "dark" | "light";
  notifications: boolean;
  sounds: boolean;
}

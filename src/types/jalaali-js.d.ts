declare module 'jalaali-js' {
  export interface Jalaali { jy: number; jm: number; jd: number }
  export interface Gregorian { gy: number; gm: number; gd: number }
  export function toJalaali(gy: number, gm: number, gd: number): Jalaali;
  export function toJalaali(date: Date): Jalaali;
  export function toGregorian(jy: number, jm: number, jd: number): Gregorian;
  export function isValidJalaaliDate(jy: number, jm: number, jd: number): boolean;
  export function isLeapJalaaliYear(jy: number): boolean;
  export function jalaaliMonthLength(jy: number, jm: number): number;
  export function j2d(jy: number, jm: number, jd: number): number;
  export function d2j(jdn: number): Jalaali;
  export function g2d(gy: number, gm: number, gd: number): number;
  export function d2g(jdn: number): Gregorian;
}

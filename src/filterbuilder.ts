import { get_property_keys, mk_builder } from "./odataquery";

export type FilterBuilderTyped<T> =
  T extends Array<infer R> ? FilterBuilderCollection<R> :
  T extends string ? FilterBuilderString :
  T extends number ? FilterBuilderNumber :
  T extends boolean ? FilterBuilderBoolean :
  T extends Date ? FilterBuilderDate :
  T extends Object ? FilterBuilderComplex<T> :
  never;

export type FilterBuilderComplex<T> = {
  [P in keyof T]: FilterBuilderTyped<T[P]>
}

export type FilterExpresion = FilterExpresionUnit | IFilterExpresion;

export class ComplexFilterExpresion implements IFilterExpresion {
  constructor(protected readonly exp: string) { }

  _kind: 'expr' = 'expr';
  not = () => mk_expr(`not (${this.exp})`);
  and = (exp: IFilterExpresion) => mk_expr(`${this._getFilterExpresion()} and ${exp._getFilterExpresion(true)}`);
  or = (exp: IFilterExpresion) => mk_expr(`${this._getFilterExpresion()} or ${exp._getFilterExpresion(true)}`);

  _getFilterExpresion = (checkParetheses = false) => {
    if (!checkParetheses) return this.exp;

    if (this.exp.indexOf(' or ') > -1 || this.exp.indexOf(' and ') > -1) {
      return `(${this.exp})`;
    }

    return this.exp;
  }
}

export class FilterExpresionUnit {
  _kind: 'none' = 'none';
  not = () => new FilterExpresionUnit();
  and = (exp: IFilterExpresion) => exp;
  or = (exp: IFilterExpresion) => exp;
  _getFilterExpresion = () => null;
}

export interface IFilterExpresion {
  _kind: 'expr';
  not(): IFilterExpresion;
  and(exp: IFilterExpresion): IFilterExpresion;
  or(exp: IFilterExpresion): IFilterExpresion;
  _getFilterExpresion(checkParetheses?: boolean): string;
}

export const mk_expr_unit = () => new FilterExpresionUnit();
const mk_expr = (exp: string) => new ComplexFilterExpresion(exp);

export interface FilterBuilderDate {
  inTimeSpan(y: number, m?: number, d?: number, h?: number, mm?: number): ComplexFilterExpresion;
  isSame(d: string|Date|FilterBuilderDate): ComplexFilterExpresion;
  isSame(d: number|Date|FilterBuilderDate, g: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second'): ComplexFilterExpresion;
  isAfter(d: string|Date|FilterBuilderDate): ComplexFilterExpresion;
  isBefore(d: string|Date|FilterBuilderDate): ComplexFilterExpresion;
}

export interface StringOptions {
  /** @default false */
  caseInsensitive?: boolean;
}

export interface FilterBuilderString {
  notNull(): ComplexFilterExpresion;
  contains(s: string | FilterBuilderString, options?: StringOptions): ComplexFilterExpresion;
  equals(s: string | FilterBuilderString, options?: StringOptions): ComplexFilterExpresion;
  notEquals(s: string | FilterBuilderString, options?: StringOptions): ComplexFilterExpresion;
  startsWith(s: string | FilterBuilderString, options?: StringOptions): ComplexFilterExpresion;
  endsWith(s: string | FilterBuilderString, options?: StringOptions): ComplexFilterExpresion;
}

export interface FilterBuilderNumber {
  equals(n: number | FilterBuilderNumber): ComplexFilterExpresion;
  notEquals(n: number | FilterBuilderNumber): ComplexFilterExpresion;
  biggerThan(n: number | FilterBuilderNumber): ComplexFilterExpresion;
  lessThan(n: number | FilterBuilderNumber): ComplexFilterExpresion;
}

export interface FilterBuilderBoolean {
  equals(b: boolean | FilterBuilderBoolean): ComplexFilterExpresion;
  notEquals(b: boolean | FilterBuilderBoolean): ComplexFilterExpresion;
}

export interface FilterBuilderCollection<T> {
  notEmpty(): ComplexFilterExpresion;
  any(c: (_: FilterBuilderTyped<T>) => IFilterExpresion): ComplexFilterExpresion;
  all(c: (_: FilterBuilderTyped<T>) => IFilterExpresion): ComplexFilterExpresion;
}

export class FilterBuilder {
  constructor(protected readonly prefix: string) { }

  getPropName = () => this.prefix;

  /////////////////////
  // FilterBuilderDate

  inTimeSpan = (y: number, m?: number, d?: number, h?: number, mm?: number) => {
    let exps = [`year(${this.prefix}) eq ${y}`];
    if (m != undefined) exps.push(`month(${this.prefix}) eq ${m}`);
    if (d != undefined) exps.push(`day(${this.prefix}) eq ${d}`);
    if (h != undefined) exps.push(`hour(${this.prefix}) eq ${h}`);
    if (mm != undefined) exps.push(`minute(${this.prefix}) eq ${mm}`);
    return mk_expr('(' + exps.join(') and (') + ')');
  }

  isSame = (x: string|number|Date|FilterBuilder, g?: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second') => {
    if (typeof x === 'string') {
      return mk_expr(`${this.prefix} eq ${x}`);
    }

    else if (typeof x === 'number') {
      return mk_expr(`${g}(${this.prefix}) eq ${x}`);
    }
    
    else if (x instanceof Date) {
      if (g == null) {
        return mk_expr(`${this.prefix} eq ${x.toISOString()}`);
      } else {
        const o = this.dateToObject(x);
        return mk_expr(`${g}(${this.prefix}) eq ${o[g]}`);
      }
    }

    else {
      return mk_expr(`${g}(${this.prefix}) eq ${g}(${x.getPropName()})`);
    }
  }

  isAfter = (d: string|Date|FilterBuilder) => {
    if (typeof d === 'string') return mk_expr(`${this.prefix} gt ${d}`);
    else if (d instanceof Date) return mk_expr(`${this.prefix} gt ${d.toISOString()}`);
    else return mk_expr(`${this.prefix} gt ${d.getPropName()}`);
  };

  isBefore = (d: string|Date|FilterBuilder) => {
    if (typeof d === 'string') return mk_expr(`${this.prefix} lt ${d}`);
    else if (d instanceof Date) return mk_expr(`${this.prefix} lt ${d.toISOString()}`);
    else return mk_expr(`${this.prefix} gt ${d.getPropName()}`);
  };

  protected dateToObject = (d: Date) => {
    if (typeof d === 'string') {
      d = new Date(d);
    }

    return {
      year: d.getFullYear(),
      month: d.getMonth(),
      day: d.getFullYear(),
      hour: d.getFullYear(),
      minute: d.getFullYear(),
      second: d.getFullYear(),
    }
  }
  
  ////////////////
  // FilterBuilderArray
  
  notEmpty = () => mk_expr(`${this.prefix}/any()`);

  any = (exp: (_: any) => IFilterExpresion) => {
    const keys = get_property_keys(exp);
    
    if (keys.length) {
      const builder = exp(mk_builder(keys, FilterBuilder));
      const expr = builder._getFilterExpresion();
      return mk_expr(`${this.prefix}/any(x:x/${expr})`);
    } else {
      const builder = exp(new FilterBuilder('x'));
      const expr = builder._getFilterExpresion();
      return mk_expr(`${this.prefix}/any(x:${expr})`);
    }
  };

  all = (exp: (_: any) => IFilterExpresion) => {
    const keys = get_property_keys(exp);
    
    if (keys.length) {
      const builder = exp(mk_builder(keys, FilterBuilder));
      const expr = builder._getFilterExpresion();
      return mk_expr(`${this.prefix}/all(x:x/${expr})`);
    } else {
      const builder = exp(new FilterBuilder('x'));
      const expr = builder._getFilterExpresion();
      return mk_expr(`${this.prefix}/all(x:${expr})`);
    }
  };

  ///////////////////////
  // FilterBuilderString

  notNull = () => mk_expr(`${this.prefix} ne null`);

  contains = (s: any|FilterBuilder, opt?: StringOptions) => {
    if (opt && opt.caseInsensitive) {
      return mk_expr(`contains(tolower(${this.prefix}), ${typeof s == 'string'
        ? `'${s.toLocaleLowerCase()}'`
        : `tolower(${s.getPropName()})`})`);
    }

    if (s.getPropName) {
      return mk_expr(`contains(${this.prefix}, ${s.getPropName()})`);
    }

    return mk_expr(`contains(${this.prefix}, ${typeof s == 'string' ? `'${s}'` : s})`);
  };

  startsWith = (s: string | FilterBuilder, opt?: StringOptions) => {
    if (opt && opt.caseInsensitive) {
      return mk_expr(`startswith(tolower(${this.prefix}), ${typeof s == 'string'
        ? `'${s.toLocaleLowerCase()}'`
        : `tolower(${s.getPropName()})`})`);
    }

    return mk_expr(`startswith(${this.prefix}, ${typeof s == 'string' ? `'${s}'` : s.getPropName()})`);
  };

  endsWith = (s: string | FilterBuilder, opt?: StringOptions) => {
    if (opt && opt.caseInsensitive) {
      return mk_expr(`endswith(tolower(${this.prefix}), ${typeof s == 'string'
        ? `'${s.toLocaleLowerCase()}'`
        : `tolower(${s.getPropName()})`})`);
    }

    return mk_expr(`endswith(${this.prefix}, ${typeof s == 'string' ? `'${s}'` : s.getPropName()})`);
  };

  ///////////////////////
  // FilterBuilderNumber

  biggerThan = (n: number | FilterBuilder) => mk_expr(`${this.prefix} gt ${
    typeof n == 'number'
      ? n
      : n.getPropName()
    }`);

  lessThan = (n: number | FilterBuilder) => mk_expr(`${this.prefix} lt ${
    typeof n == 'number'
      ? n
      : n.getPropName()
    }`);

  ////////////////////////////////
  // FilterBuilder Generic Methods

  equals = (x: string|number|boolean|FilterBuilder, o: any) => {
    switch (typeof x) {
      case 'string':
      if (o && o.caseInsensitive) {
        return mk_expr(`tolower(${this.prefix}) eq '${x.toLocaleLowerCase()}'`);
      }

      return mk_expr(`${this.prefix} eq '${x}'`);

      case 'number':
      return mk_expr(`${this.prefix} eq ${x}`);

      case 'boolean':
      return mk_expr(`${this.prefix} eq ${x}`);

      default:
      if (o && o.caseInsensitive) {
        return mk_expr(`tolower(${this.prefix}) eq tolower(${x.getPropName()})`);
      }

      return mk_expr(`${this.prefix} eq ${x.getPropName()}`);
    }
  };

  notEquals = (x: string|number|boolean|FilterBuilder, o: any) => {
    switch (typeof x) {
      case 'string':
      if (o && o.caseInsensitive) {
        return mk_expr(`tolower(${this.prefix}) ne '${x.toLocaleLowerCase()}'`);
      }

      return mk_expr(`${this.prefix} ne '${x}'`);

      case 'number':
      return mk_expr(`${this.prefix} ne ${x}`);

      case 'boolean':
      return mk_expr(`${this.prefix} ne ${x}`);

      default:
      if (o && o.caseInsensitive) {
        return mk_expr(`tolower(${this.prefix}) ne tolower(${x.getPropName()})`);
      }

      return mk_expr(`${this.prefix} ne ${x.getPropName()}`);
    }
  };
}

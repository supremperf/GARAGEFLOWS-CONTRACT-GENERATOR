declare module 'sql.js' {
  export interface SqlJsStatic {
    Database: new (data?: Uint8Array) => SqlDatabase;
  }
  export interface SqlDatabase {
    run(sql: string, params?: unknown[]): void;
    exec(sql: string): unknown;
    prepare(sql: string): SqlStatement;
    export(): Uint8Array;
    close(): void;
  }
  export interface SqlStatement {
    bind(values?: unknown[]): boolean;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): boolean;
  }
  export default function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<SqlJsStatic>;
}

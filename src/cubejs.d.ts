declare module 'cubejs' {
  type CubeJSON = unknown;

  class Cube {
    constructor(state?: CubeJSON);
    move(arg: string | number | number[]): Cube;
    asString(): string;
    isSolved(): boolean;
    clone(): Cube;
    toJSON(): CubeJSON;
    solve(maxDepth?: number): string;
    solveUpright(maxDepth?: number): string;
    upright(): string;
    randomize(): Cube;
    multiply(other: Cube): Cube;

    static fromString(s: string): Cube;
    static random(): Cube;
    static initSolver(): void;
    static scramble(): string;
    static inverse(s: string | number | number[]): string | number[];
  }

  export default Cube;
}

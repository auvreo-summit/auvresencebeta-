declare module '*.cjs' {
  const backend: { default: import('express').Express };
  export default backend;
}

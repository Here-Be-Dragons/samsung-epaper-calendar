/** Runs async jobs one at a time, in order; a failed job rejects its own caller only. */
export function serial() {
  let tail = Promise.resolve();
  return (job) => {
    const run = tail.then(job);
    tail = run.then(() => {}, () => {});
    return run;
  };
}

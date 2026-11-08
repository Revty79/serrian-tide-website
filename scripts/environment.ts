/** Explicit operator entrypoint. Never loads .env files or an implicit owner database. */
process.env.DATABASE_URL="postgresql://operator_inert:unused@127.0.0.1:1/no_implicit_database";
void import("./environment/cli").then(module=>module.main()).catch(()=>{console.error("OPERATOR_START_FAILED: Check the supported runtime and reviewed configuration; no shared environment is selected automatically.");process.exitCode=1;});

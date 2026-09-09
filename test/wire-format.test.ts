import assert from "node:assert/strict";
import {
  decodeVariableValues,
  encodeVariableValues,
} from "../src/utils/variables/wire-format.js";

async function testEncodeRendersValuesAsText() {
  assert.deepEqual(encodeVariableValues({ value: 1500 }), { value: "1500" });
  assert.deepEqual(encodeVariableValues({ value: 2n ** 62n + 1n }), {
    value: "4611686018427387905",
  });
  assert.deepEqual(encodeVariableValues({ value: -(2n ** 63n) }), {
    value: "-9223372036854775808",
  });
}

async function testEncodeWalksVariableMaps() {
  assert.deepEqual(encodeVariableValues({ variables: { coins: 50, jackpot: 2n ** 62n } }), {
    variables: { coins: "50", jackpot: "4611686018427387904" },
  });
}

async function testEncodeKeepsNullThatDeletes() {
  assert.deepEqual(encodeVariableValues({ variables: { coins: 50, tmp: null } }), {
    variables: { coins: "50", tmp: null },
  });
}

async function testEncodeWalksBatchRequests() {
  const body = {
    requests: [
      { method: "PATCH", path: "users/44", body: { value: 10 }, op_id: "a" },
      { method: "DELETE", path: "pets/12" },
    ],
  };
  assert.deepEqual(encodeVariableValues(body), {
    requests: [
      { method: "PATCH", path: "users/44", body: { value: "10" }, op_id: "a" },
      { method: "DELETE", path: "pets/12" },
    ],
  });
}

async function testEncodeLeavesNonIntegersForValidation() {
  assert.deepEqual(encodeVariableValues({ value: 1.5 }), { value: 1.5 });
  assert.deepEqual(encodeVariableValues({ value: "already text" }), { value: "already text" });
}

async function testDecodeParsesValuesAsBigint() {
  const decoded = decodeVariableValues({ value: "9007199254740993" }) as unknown as { value: bigint };
  assert.equal(decoded.value, 9007199254740993n);
  assert.equal(typeof decoded.value, "bigint");
}

async function testDecodeWalksNestedBodies() {
  const decoded = decodeVariableValues({
    variables: {
      coins: { value: "9223372036854775807", creation_time: "t", update_time: "t" },
      note: { value: "1", creation_time: "t", update_time: "t" },
    },
  }) as unknown as { variables: Record<string, { value: bigint }> };
  assert.equal(decoded.variables["coins"]!.value, 9223372036854775807n);
  assert.equal(decoded.variables["note"]!.value, 1n);
}

async function testDecodeWalksArrays() {
  const decoded = decodeVariableValues({ items: [{ value: "1" }, { value: "2" }] }) as unknown as {
    items: { value: bigint }[];
  };
  assert.deepEqual(
    decoded.items.map((item) => item.value),
    [1n, 2n],
  );
}

async function testDecodeLeavesNumericLookingIdentifiers() {
  const decoded = decodeVariableValues({
    users: ["9223372036854775807", "ok"],
    furni: [],
    global: [],
  }) as { users: string[] };
  assert.equal(decoded.users[0], "9223372036854775807");
  assert.equal(typeof decoded.users[0], "string");
}

async function testDecodeLeavesNonIntegerText() {
  const decoded = decodeVariableValues({ value: "not-a-number" }) as { value: string };
  assert.equal(decoded.value, "not-a-number");
}

async function testRoundTripPreservesInt64() {
  const original = 749358347632312320n;
  const wire = encodeVariableValues({ value: original });
  const back = decodeVariableValues(wire) as { value: bigint };
  assert.equal(back.value, original);
}

const tests = [
  testEncodeRendersValuesAsText,
  testEncodeWalksVariableMaps,
  testEncodeKeepsNullThatDeletes,
  testEncodeWalksBatchRequests,
  testEncodeLeavesNonIntegersForValidation,
  testDecodeParsesValuesAsBigint,
  testDecodeWalksNestedBodies,
  testDecodeWalksArrays,
  testDecodeLeavesNumericLookingIdentifiers,
  testDecodeLeavesNonIntegerText,
  testRoundTripPreservesInt64,
];

for (const test of tests) {
  await test();
  console.log(`ok - ${test.name}`);
}

console.log(`\n${tests.length} passed`);

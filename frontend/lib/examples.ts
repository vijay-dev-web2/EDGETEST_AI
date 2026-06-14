export interface CodeExample {
  id: string;
  title: string;
  description: string;
  language: "python" | "typescript" | "javascript" | "java" | "csharp" | "cpp";
  userStory: string;
  code: string;
  tag: string;
  tagColor: string;
}

export const CODE_EXAMPLES: CodeExample[] = [
  {
    id: "calculator",
    title: "Calculator",
    description: "Python arithmetic with edge-case handling",
    language: "python",
    tag: "Demo",
    tagColor: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    userStory:
      "As a developer, I want a calculator that handles basic arithmetic operations (add, subtract, multiply, divide, power, sqrt) with proper error handling for edge cases like division by zero and negative square roots.",
    code: `class Calculator:
    """A simple calculator with basic arithmetic operations."""

    def add(self, a: float, b: float) -> float:
        """Add two numbers."""
        return a + b

    def subtract(self, a: float, b: float) -> float:
        """Subtract b from a."""
        return a - b

    def multiply(self, a: float, b: float) -> float:
        """Multiply two numbers."""
        return a * b

    def divide(self, a: float, b: float) -> float:
        """Divide a by b. Raises ValueError if b is zero."""
        if b == 0:
            raise ValueError("Cannot divide by zero")
        return a / b

    def power(self, base: float, exp: float) -> float:
        """Raise base to the power of exp."""
        return base ** exp

    def sqrt(self, n: float) -> float:
        """Calculate square root. Raises ValueError for negative numbers."""
        if n < 0:
            raise ValueError("Cannot take square root of a negative number")
        return n ** 0.5

    def modulo(self, a: float, b: float) -> float:
        """Return remainder of a divided by b."""
        if b == 0:
            raise ValueError("Cannot compute modulo with divisor zero")
        return a % b
`,
  },
  {
    id: "shopping-cart",
    title: "Shopping Cart",
    description: "E-commerce cart with discounts and inventory",
    language: "python",
    tag: "E-commerce",
    tagColor: "bg-green-500/15 text-green-400 border-green-500/30",
    userStory:
      "As a shopper, I want to add items to a cart, apply discount codes, see the total price, and check out — with proper validation so I can't buy more than what's in stock or apply invalid coupons.",
    code: `from dataclasses import dataclass, field
from typing import Optional


@dataclass
class CartItem:
    sku: str
    name: str
    price: float
    quantity: int


class ShoppingCart:
    """E-commerce shopping cart with discount code support."""

    VALID_COUPONS = {"SAVE10": 0.10, "SAVE20": 0.20, "HALFOFF": 0.50}
    INVENTORY = {"APPLE": 100, "BOOK": 50, "LAPTOP": 10}

    def __init__(self):
        self._items: dict[str, CartItem] = {}
        self._coupon: Optional[str] = None

    def add_item(self, sku: str, name: str, price: float, quantity: int = 1) -> None:
        if price < 0:
            raise ValueError("Price cannot be negative")
        if quantity <= 0:
            raise ValueError("Quantity must be positive")
        stock = self.INVENTORY.get(sku.upper(), 999)
        current_qty = self._items[sku].quantity if sku in self._items else 0
        if current_qty + quantity > stock:
            raise ValueError(f"Insufficient stock: only {stock - current_qty} remaining")
        if sku in self._items:
            self._items[sku].quantity += quantity
        else:
            self._items[sku] = CartItem(sku, name, price, quantity)

    def remove_item(self, sku: str) -> None:
        if sku not in self._items:
            raise KeyError(f"Item {sku!r} not in cart")
        del self._items[sku]

    def apply_coupon(self, code: str) -> float:
        code = code.upper()
        if code not in self.VALID_COUPONS:
            raise ValueError(f"Invalid coupon code: {code!r}")
        self._coupon = code
        return self.VALID_COUPONS[code]

    def subtotal(self) -> float:
        return sum(item.price * item.quantity for item in self._items.values())

    def total(self) -> float:
        sub = self.subtotal()
        if self._coupon:
            sub *= 1 - self.VALID_COUPONS[self._coupon]
        return round(sub, 2)

    def item_count(self) -> int:
        return sum(item.quantity for item in self._items.values())

    def checkout(self) -> dict:
        if not self._items:
            raise ValueError("Cart is empty")
        return {
            "items": [vars(i) for i in self._items.values()],
            "coupon": self._coupon,
            "subtotal": self.subtotal(),
            "total": self.total(),
        }
`,
  },
  {
    id: "jwt-auth",
    title: "JWT Authentication",
    description: "TypeScript token generation and validation",
    language: "typescript",
    tag: "Auth",
    tagColor: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    userStory:
      "As a backend engineer, I want to issue JWT access tokens on login and validate them on each API request — with proper expiry handling, signature verification, and refresh token rotation so user sessions stay secure.",
    code: `import * as crypto from "crypto";

export interface JwtPayload {
  sub: string;
  email: string;
  role: "user" | "admin";
  iat: number;
  exp: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const ACCESS_TTL = 15 * 60;       // 15 minutes
const REFRESH_TTL = 7 * 24 * 60 * 60; // 7 days

function base64url(data: string): string {
  return Buffer.from(data).toString("base64url");
}

function hmacSign(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

export function issueTokens(
  userId: string,
  email: string,
  role: "user" | "admin",
  secret: string
): TokenPair {
  if (!userId || !email || !secret) throw new Error("Missing required fields");

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));

  const accessPayload = base64url(
    JSON.stringify({ sub: userId, email, role, iat: now, exp: now + ACCESS_TTL })
  );
  const accessSig = hmacSign(\`\${header}.\${accessPayload}\`, secret);
  const accessToken = \`\${header}.\${accessPayload}.\${accessSig}\`;

  const refreshPayload = base64url(
    JSON.stringify({ sub: userId, iat: now, exp: now + REFRESH_TTL, type: "refresh" })
  );
  const refreshSig = hmacSign(\`\${header}.\${refreshPayload}\`, secret);
  const refreshToken = \`\${header}.\${refreshPayload}.\${refreshSig}\`;

  return { accessToken, refreshToken, expiresIn: ACCESS_TTL };
}

export function verifyToken(token: string, secret: string): JwtPayload {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token format");

  const [header, payload, signature] = parts;
  const expected = hmacSign(\`\${header}.\${payload}\`, secret);
  if (signature !== expected) throw new Error("Invalid token signature");

  const decoded: JwtPayload = JSON.parse(Buffer.from(payload, "base64url").toString());
  const now = Math.floor(Date.now() / 1000);
  if (decoded.exp < now) throw new Error("Token has expired");

  return decoded;
}

export function refreshAccessToken(refreshToken: string, secret: string): string {
  const parts = refreshToken.split(".");
  if (parts.length !== 3) throw new Error("Invalid refresh token");

  const [header, payload, signature] = parts;
  const expected = hmacSign(\`\${header}.\${payload}\`, secret);
  if (signature !== expected) throw new Error("Invalid refresh token signature");

  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (decoded.type !== "refresh") throw new Error("Not a refresh token");
  const now = Math.floor(Date.now() / 1000);
  if (decoded.exp < now) throw new Error("Refresh token has expired");

  const newPayload = base64url(
    JSON.stringify({ sub: decoded.sub, iat: now, exp: now + ACCESS_TTL })
  );
  const sig = hmacSign(\`\${header}.\${newPayload}\`, secret);
  return \`\${header}.\${newPayload}.\${sig}\`;
}
`,
  },
];

export const DEMO_EXAMPLE = CODE_EXAMPLES[0];

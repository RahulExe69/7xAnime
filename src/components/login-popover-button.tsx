import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import Button from "./common/custom-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Input } from "./ui/input";
import GoogleIcon from "@/icons/google";
import { pb } from "@/lib/pocketbase";
import { toast } from "sonner";
import { Bookmark, Compass, UserRound } from "lucide-react";
import Link from "next/link";
import { ROUTES } from "@/constants/routes";
import { useAuthStore } from "@/store/auth-store";
import { isLocalBackendEnabled } from "@/lib/api";

type FormData = {
  username: string;
  email: string;
  password: string;
  confirm_password: string;
};

function LoginPopoverButton() {
  const auth = useAuthStore();
  const [formData, setFormData] = useState<FormData>({
    username: "",
    email: "",
    password: "",
    confirm_password: "",
  });
  const [tabValue, setTabValue] = useState<"login" | "signup">("login");

  const loginWithEmail = async () => {
    try {
      if (formData.username === "" || formData.password === "") {
        toast.error("Please fill in all fields", {
          style: { background: "red" },
        });
        return;
      }

      await pb
        .collection("users")
        .authWithPassword(formData.username, formData.password);

      if (pb.authStore.isValid && pb.authStore.record) {
        toast.success("Login successful", { style: { background: "green" } });
        clearForm();
        auth.setAuth({
          id: pb.authStore.record.id,
          email: pb.authStore.record.email,
          username: pb.authStore.record.username,
          avatar: pb.authStore.record.avatar,
          collectionId: pb.authStore.record.collectionId,
          collectionName: pb.authStore.record.collectionName,
          autoSkip: pb.authStore.record.autoSkip,
          created: pb.authStore.record.created,
        });
      }
    } catch (e) {
      console.error("Login error:", e);
      toast.error("Invalid username or password", {
        style: { background: "red" },
      });
    }
  };

  const signupWithEmail = async () => {
    if (
      formData.username === "" ||
      formData.password === "" ||
      formData.email === "" ||
      formData.confirm_password === ""
    ) {
      toast.error("Please fill in all fields", {
        style: { background: "red" },
      });
      return;
    }

    try {
      const user = await pb.collection("users").create({
        username: formData.username,
        email: formData.email,
        password: formData.password,
        passwordConfirm: formData.confirm_password,
      });

      if (user) {
        toast.success("Account created successfully. Please login.", {
          style: { background: "green" },
        });
        clearForm();
        setTabValue("login");
      }
    } catch (e: any) {
      if (e.response?.data) {
        for (const key in e.response?.data) {
          toast.error(`${key}: ${e.response.data[key].message}`, {
            style: { background: "red" },
          });
        }
      } else {
        toast.error("Signup failed. Please try again.", {
          style: { background: "red" },
        });
      }
    }
  };

  const clearForm = () => {
    setFormData({
      username: "",
      email: "",
      password: "",
      confirm_password: "",
    });
  };

  const loginWithGoogle = async () => {
    try {
      const result = await pb.collection("users").authWithOAuth2({
        provider: "google",
      });
      const record = pb.authStore.record;

      if (pb.authStore.isValid && record) {
        let username = record.username;

        if (!username) {
          const updated = await pb.collection("users").update(record.id, {
            username:
              result.meta?.username ||
              result.meta?.name ||
              record.email?.split("@")[0] ||
              "7xAnimeUser",
          });
          username = updated.username;
        }

        toast.success("Google sign-in successful", {
          style: { background: "green" },
        });
        auth.setAuth({
          id: record.id,
          email: record.email,
          username,
          avatar: record.avatar,
          collectionId: record.collectionId,
          collectionName: record.collectionName,
          autoSkip: record.autoSkip,
          created: record.created,
        });
        clearForm();
      }
    } catch (error) {
      console.error("Google sign-in error:", error);
      toast.error("Google sign-in is not configured on the PocketBase server yet.", {
        style: { background: "red" },
      });
    }
  };

  if (isLocalBackendEnabled()) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" aria-label="Guest profile" title="Guest profile" className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-[#d7cfea] transition hover:border-[#ff3b72]/45 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff3b72]">
            <UserRound className="h-5 w-5" aria-hidden="true" />
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#100309] bg-amber-400" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" side="bottom" className="mt-2 w-64 rounded-2xl border-white/10 bg-[#1b0710] p-4 text-white shadow-2xl shadow-black/40">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-[#ff3b72]/15 text-[#ff9fbe]"><UserRound className="h-5 w-5" /></div>
            <div className="min-w-0"><p className="font-bold">Guest profile</p><p className="text-xs text-zinc-400">No account signed in</p></div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-zinc-400">Your watch progress is stored on this device.</p>
          <div className="mt-3 flex flex-col gap-1 border-t border-white/[0.08] pt-3">
            <Link href={ROUTES.SEARCH} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition hover:bg-white/[0.06]"><Compass className="h-4 w-4" /> Explore anime</Link>
            <Link href="/library" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition hover:bg-white/[0.06]"><Bookmark className="h-4 w-4" /> My list</Link>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label="Sign in or open profile"
          title="Sign in"
          className="grid h-9 w-9 place-items-center rounded-full border-white/10 bg-white/[0.04] p-0 text-zinc-200 transition hover:border-[#ff3b72]/40 hover:bg-[#ff3b72]/10 hover:text-white"
        >
          <UserRound className="h-5 w-5" aria-hidden="true" />
          <span className="sr-only">Sign in</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        className="w-[300px] rounded-2xl border-white/10 bg-[#1b0710] text-white shadow-2xl shadow-black/40"
      >
        <Tabs
          defaultValue={tabValue}
          value={tabValue}
          onValueChange={(value) => setTabValue(value as "login" | "signup")}
        >
          <TabsList>
            <TabsTrigger onClick={clearForm} value="login">
              Login
            </TabsTrigger>
            <TabsTrigger onClick={clearForm} value="signup">
              Signup
            </TabsTrigger>
          </TabsList>
          <TabsContent value="login" className="flex flex-col gap-2">
            <div className="mt-2">
              <p className="text-gray-300 text-xs">Email or Username:</p>
              <Input
                required
                onChange={(e) =>
                  setFormData({ ...formData, username: e.target.value })
                }
                type="text"
                value={formData.username}
                placeholder="Enter your email/username"
              />
            </div>
            <div>
              <p className="text-gray-300 text-xs">Password:</p>
              <Input
                required
                type="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                placeholder="Enter your password"
              />
            </div>
            <Button
              variant="default"
              className="w-full text-xs"
              size="sm"
              type="submit"
              onClick={loginWithEmail}
            >
              Login
            </Button>
            <hr className="text-white text-xs text-center" />
            <Button
              variant="default"
              className="w-full bg-white text-xs text-black hover:bg-gray-100"
              size="sm"
              onClick={loginWithGoogle}
            >
              <GoogleIcon className="mr-2 h-4 w-4" />
              Login with Google
            </Button>
          </TabsContent>
          <TabsContent value="signup" className="flex flex-col gap-2">
            <div>
              <p className="text-gray-300 text-xs">Username:</p>
              <Input
                required
                onChange={(e) =>
                  setFormData({ ...formData, username: e.target.value })
                }
                type="text"
                placeholder="Enter your username"
              />
            </div>
            <div>
              <p className="text-gray-300 text-xs">Email:</p>
              <Input
                required
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                type="email"
                placeholder="Enter your email"
              />
            </div>
            <div>
              <p className="text-gray-300 text-xs">Password:</p>
              <Input
                required
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                type="password"
                placeholder="Enter your password"
              />
            </div>
            <div>
              <p className="text-gray-300 text-xs">Confirm Password:</p>
              <Input
                required
                onChange={(e) =>
                  setFormData({ ...formData, confirm_password: e.target.value })
                }
                type="password"
                placeholder="Enter your password again"
              />
            </div>
            <Button
              variant="default"
              className="w-full text-xs"
              size="sm"
              type="submit"
              onClick={signupWithEmail}
            >
              Signup
            </Button>
            <hr className="text-white text-xs text-center" />
            <Button
              variant="default"
              className="w-full bg-white text-xs text-black hover:bg-gray-100"
              size="sm"
              onClick={loginWithGoogle}
            >
              <GoogleIcon className="mr-2 h-4 w-4" />
              Continue with Google
            </Button>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

export default LoginPopoverButton;

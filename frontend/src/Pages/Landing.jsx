import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";
import { API_BASE } from "../config/api";

const Landing = () => {
  const [formData, setFormData] = useState({ email: "", password: "", name: "" });
  const [isSignup, setIsSignup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { user, login, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // If user is already authenticated, send them to the dashboard
  useEffect(() => {
    if (!authLoading && user) {
      navigate("/me");
    }
  }, [user, authLoading, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.email || !formData.password) {
      setError("Please fill in all fields");
      return;
    }

    if (isSignup && !formData.name) {
      setError("Please fill in all fields including name");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const endpoint = isSignup ? "/auth/signup" : "/auth/login";
      const payload = isSignup
        ? { email: formData.email, password: formData.password, name: formData.name }
        : { email: formData.email, password: formData.password };

      const response = await axios.post(API_BASE + endpoint, payload);

      if (response.data.status === "success") {
        // Store user and token
        login(response.data.data.user, response.data.data.token);
        // Navigate to dashboard
        navigate("/me");
      }
    } catch (err) {
      console.error("Auth error:", err);
      setError(
        err.response?.data?.message || 
        (isSignup ? "Signup failed. Please try again." : "Login failed. Please check your credentials.")
      );
      setLoading(false);
    }
  };

  const handleSignUp = () => {
    setIsSignup(true);
    setError("");
  };

  // Keep LinkedIn button present but not wired to real auth (as requested)
  const handleLinkedInSignIn = () => {
    console.log("LinkedIn sign-in clicked (not implemented)");
  };

  return (
    <div
      className="min-h-screen w-full flex justify-center"
      style={{
        background:
          "linear-gradient(45deg, #443628 0%, #ED8A50 44%, #BF341E 100%)",
      }}
    >
      <div className="w-full max-w-[430px] min-h-[932px] flex flex-col">
        {/* Header */}
        <div className="pt-16 text-center px-6">
          {/* Intentionally no subtitle text here */}
          <h1
            className="mt-2 font-display text-[80px] uppercase text-brand-dark"
            style={{ textShadow: "0 4px 0 #B31F19" }}
          >
            Journal
          </h1>
        </div>

        {/* Dark Sheet */}
        <div className="mt-8 rounded-t-[20px] px-6 pt-8 pb-10 flex-1 shadow-lg bg-brand-dark">
          <h2 className="font-sans font-bold text-center uppercase text-white text-[22px] mb-6">
            WELCOME!
          </h2>

          <p className="font-sans font-medium text-white text-[20px] leading-[24px] mb-8 text-left">
            {isSignup ? "Sign up" : "Log in"}
          </p>

          {/* LinkedIn Sign-in (UI only, no redirect) */}
          <button
            onClick={handleLinkedInSignIn}
            disabled={loading}
            className="w-full h-12 mb-4 bg-white text-gray-body font-sans font-medium hover:bg-gray-50 
                       transition disabled:opacity-50 rounded-[20px] text-[16px] flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#0A66C2"
                d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.447-2.136 2.941v5.665H9.351V9h3.414v1.561h.049c.476-.9 1.637-1.852 3.369-1.852 3.602 0 4.268 2.372 4.268 5.459v6.284zM5.337 7.433a2.062 2.062 0 110-4.124 2.062 2.062 0 010 4.124zM7.119 20.452H3.554V9h3.565v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.225.792 24 1.771 24h20.451C23.2 24 24 23.225 24 22.271V1.729C24 .774 23.2 0 22.225 0z"
              />
            </svg>
            {loading ? "Signing in..." : "Continue with LinkedIn"}
          </button>

          {/* Divider */}
          <div className="flex items-center my-6">
            <hr className="flex-grow border-gray-body" />
            <span className="px-2 font-sans font-normal text-gray-body text-[14px]">
              or
            </span>
            <hr className="flex-grow border-gray-body" />
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-[#FDEAEA] border border-brand-red rounded-lg">
              <p className="text-brand-red text-sm text-center">{error}</p>
            </div>
          )}

          {/* Email Login/Signup */}
          <form onSubmit={handleSubmit}>
            {isSignup && (
              <input
                type="text"
                name="name"
                placeholder="Name"
                value={formData.name}
                onChange={handleChange}
                className="w-full h-12 mb-4 px-4 bg-white text-black rounded-[20px]"
                required
              />
            )}

            <input
              type="email"
              name="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
              className="w-full h-12 mb-4 px-4 bg-white text-black rounded-[20px]"
              required
            />

            <input
              type="password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              className="w-full h-12 mb-2 px-4 bg-white text-black rounded-[20px]"
              required
            />

            <div className="text-right mb-6">
              <Link
                to="/forgot-password"
                className="font-sans font-normal underline text-gray-body text-[14px]"
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 text-white font-sans font-bold uppercase rounded-[20px] text-[16px] bg-gradient-to-r from-brand-orange to-brand-red"
            >
              {loading ? "PROCESSING..." : isSignup ? "SIGN UP" : "LOG IN"}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            {isSignup ? (
              <>
                <span className="font-sans font-normal text-gray-body text-[16px]">
                  Already have an account?{" "}
                </span>
                <span
                  onClick={() => {
                    setIsSignup(false);
                    setError("");
                  }}
                  className="cursor-pointer hover:underline font-sans font-normal text-brand-orange text-[16px]"
                >
                  Log in
                </span>
              </>
            ) : (
              <>
                <span className="font-sans font-normal text-gray-body text-[16px]">
                  Don't have an account?{" "}
                </span>
                <span
                  onClick={handleSignUp}
                  className="cursor-pointer hover:underline font-sans font-normal text-brand-orange text-[16px]"
                >
                  Sign up
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Landing;

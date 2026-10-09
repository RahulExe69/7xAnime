"use client";
import React, { Suspense } from "react";
import VideoPlayerSection from "./video-player-section";

const page = () => {
  return <Suspense fallback={<div className="min-h-[60vh]" />}><VideoPlayerSection /></Suspense>;
};

export default page;


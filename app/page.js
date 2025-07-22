'use client'

import { useState } from "react";
import { FiCreditCard, FiImage, FiGrid, FiPrinter } from "react-icons/fi";
import BusinessCards from "./components/BusinessCards";
import CanvasWrap from "./components/CanvasWrap";
import CustomLayout from "./components/CustomLayout";

const tools = [
    {
        key: "business-cards",
        label: "Business Cards",
        icon: FiCreditCard,
        description: "90×50mm cards with 1mm spacing on A4/A3 sheets",
        status: "active"
    },
    {
        key: "canvas-wrap",
        label: "Canvas Wrap",
        icon: FiImage,
        description: "Canvas layouts with wrap-around bleed",
        status: "active"
    },
    {
        key: "custom-layout",
        label: "Custom Size Layout",
        icon: FiGrid,
        description: "Flexible dimensions with auto sheet optimization",
        status: "preview"
    },
];

export default function Home() {
    const [selectedTool, setSelectedTool] = useState("business-cards");

    const activeTool = tools.find(tool => tool.key === selectedTool);

    return (
        <div className="flex min-h-screen bg-gray-50">
            {/* Sidebar Navigation */}
            <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm">
                {/* Header */}
                <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                            <FiPrinter className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">Print Tools</h1>
                            <p className="text-xs text-gray-500">Professional Layout System</p>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-4">
                    <div className="space-y-2">
                        {tools.map((tool) => {
                            const IconComponent = tool.icon;
                            const isSelected = selectedTool === tool.key;
                            const isDisabled = tool.status === 'planned';
                            
                            return (
                                <button
                                    key={tool.key}
                                    disabled={isDisabled}
                                    className={`w-full flex items-start gap-3 px-3 py-3 rounded-lg transition-all duration-200 text-left ${
                                        isSelected && !isDisabled
                                            ? "bg-blue-50 border border-blue-200 text-blue-700"
                                            : isDisabled
                                            ? "text-gray-400 cursor-not-allowed opacity-60"
                                            : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                                    }`}
                                    onClick={() => !isDisabled && setSelectedTool(tool.key)}
                                >
                                    <IconComponent className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                                        isSelected && !isDisabled ? "text-blue-600" : ""
                                    }`} />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-sm">{tool.label}</span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                                            {tool.description}
                                        </p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>


                </nav>
                
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 overflow-auto">
                {selectedTool === "business-cards" && (
                    <div className="h-full">
                        <BusinessCards />
                    </div>
                )}
                
                {selectedTool === "canvas-wrap" && (
                    <div className="h-full">
                        <CanvasWrap />
                    </div>
                )}

                {selectedTool === "custom-layout" && (
                    <div className="h-full">
                        <CustomLayout />
                    </div>
                )}

                {/* Placeholder for future tools */}
                {!["business-cards", "canvas-wrap", "custom-layout"].includes(selectedTool) && (
                    <div className="p-8">
                        <div className="max-w-4xl mx-auto">
                            <div className="text-center">
                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    {activeTool?.icon && <activeTool.icon className="w-8 h-8 text-gray-600" />}
                                </div>
                                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                                    {activeTool?.label}
                                </h2>
                                <p className="text-gray-600 mb-6">
                                    {activeTool?.description}
                                </p>
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-w-md mx-auto">
                                    <p className="text-sm text-gray-700">
                                        <strong>Coming Soon:</strong> This tool is in development 
                                        as part of our expanding print layout system.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

import { Drawer } from "antd";
import { Link } from "react-router-dom";

import { UserStatusActions } from "@/components/layout/user-status-actions";
import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";

type MobileNavDrawerProps = {
    open: boolean;
    activeToolSlug?: NavigationToolSlug;
    onClose: () => void;
};

export function MobileNavDrawer({ open, activeToolSlug, onClose }: MobileNavDrawerProps) {
    return (
        <Drawer
            title={
                <Link to="/" onClick={onClose} className="inline-flex items-center gap-2 text-stone-950 dark:text-stone-100">
                    <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" className="size-7 rounded-md object-cover" />
                    <span className="font-semibold tracking-[-0.025em]">Sun canvas</span>
                </Link>
            }
            placement="left"
            size={280}
            open={open}
            onClose={onClose}
            className="md:hidden"
        >
            <div className="space-y-1">
                {navigationTools.map((tool) => {
                    const Icon = tool.icon;
                    const active = tool.slug === activeToolSlug;
                    return (
                        <Link
                            key={tool.slug}
                            to={`/${tool.slug}`}
                            onClick={onClose}
                            className={cn(
                                "flex items-center gap-3 rounded-lg px-3 py-3 text-base transition",
                                active ? "bg-stone-100 font-medium text-stone-950 dark:bg-stone-800 dark:text-stone-100" : "text-stone-600 hover:bg-stone-100 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100",
                            )}
                        >
                            <Icon className="size-5" />
                            <span>{tool.label}</span>
                        </Link>
                    );
                })}
            </div>
            <div className="mt-8 border-t border-stone-200 pt-5 dark:border-stone-800">
                <p className="mb-3 px-1 text-xs text-stone-500 dark:text-stone-400">外观与项目链接</p>
                <UserStatusActions />
            </div>
        </Drawer>
    );
}

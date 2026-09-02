import React from 'react';

import {
    Select,
    FormControl,
    MenuItem,
    ListSubheader,
    Typography,
    IconButton,
    Box,
    Checkbox,
    ListItemText,
    InputBase,
    SelectChangeEvent
} from '@mui/material';

import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import SearchIcon from '@mui/icons-material/Search';

import OptumTheme from '../../../utils/theme';

const { brand } = OptumTheme.palette;
const { body1, body2 } = OptumTheme.typography;

interface ISelectBoxProps {
    label: string;
    ariaLabel?: string;
    options: { label: string; value: string | number }[];
    initialValue: string | number | (string | number)[];
    changeFn?: (event: SelectChangeEvent<string | string[]>) => void;
    description?: string;
    isRequired?: boolean;
    multiSelect?: boolean;
    searchable?: boolean;
    placeholder?: string;
    disabled?: boolean;
}

const CustomSelectBox = (props: ISelectBoxProps) => {
    const {
        label,
        ariaLabel,
        initialValue,
        options,
        changeFn,
        description = '',
        isRequired = false,
        multiSelect = false,
        searchable = false,
        placeholder = 'Select',
        disabled = false
    } = props;

    const [searchText, setSearchText] = React.useState('');
    const labelId = `${label.replace(/\s+/g, '-').toLowerCase()}-label`;

    const normalizedOptions = React.useMemo(() => {
        return (options ?? []).filter((option) => String(option.label).length > 0);
    }, [options]);

    const filteredOptions = React.useMemo(() => {
        if (!searchable || !searchText.trim()) return normalizedOptions;
        const lower = searchText.toLowerCase();
        return normalizedOptions.filter((o) => o.label.toLowerCase().includes(lower));
    }, [normalizedOptions, searchable, searchText]);

    // Bug fix: guard against array passed in single-select mode
    const singleValue: string = React.useMemo(() => {
        if (multiSelect) return '';
        if (Array.isArray(initialValue)) return initialValue.length > 0 ? String(initialValue[0]) : '';
        return String(initialValue);
    }, [multiSelect, initialValue]);

    const selectedValues: string[] = React.useMemo(() => {
        if (!multiSelect) return [];
        if (Array.isArray(initialValue)) return initialValue.map(String);
        return initialValue !== '' ? [String(initialValue)] : [];
    }, [multiSelect, initialValue]);

    const arrowIcon = (iconProps: React.ComponentProps<typeof IconButton>) => (
        <IconButton {...iconProps} sx={{ padding: 0 }}>
            <KeyboardArrowDownIcon sx={{ color: disabled ? brand.enterpriseDarkGray : brand.hyperlink }} />
        </IconButton>
    );

    const handleClose = () => {
        setSearchText('');
    };

    return (
        <FormControl fullWidth disabled={disabled}>
            {label?.length > 0 && (
                <div>
                    <Typography
                        id={labelId}
                        variant="h6"
                        color={disabled ? brand.enterpriseDarkGray : brand.enterpriseDarkBlue}
                    >
                        {label}
                        {isRequired && (
                            <Box component="span" sx={{ fontWeight: 700, color: brand.danger }}>
                                *
                            </Box>
                        )}
                    </Typography>
                </div>
            )}
            {!!description?.length && (
                <Typography sx={{ fontSize: body2.fontSize, color: brand.enterpriseDarkGray }}>
                    {description}
                </Typography>
            )}
            <Select
                multiple={multiSelect}
                value={multiSelect ? selectedValues : singleValue}
                variant="outlined"
                size="small"
                // Bug fix: only set aria-labelledby when a label element is actually rendered
                aria-labelledby={label?.length > 0 ? labelId : undefined}
                aria-label={ariaLabel}
                IconComponent={arrowIcon}
                sx={{ backgroundColor: disabled ? undefined : brand.white }}
                onChange={changeFn}
                onClose={handleClose}
                disabled={disabled}
                displayEmpty
                // Bug fix: disable MenuProps autoFocus when searchable so InputBase autoFocus takes effect
                MenuProps={
                    searchable ? { autoFocus: false, PaperProps: { sx: { maxHeight: 320 } } } : { PaperProps: { sx: { maxHeight: 320 } } }
                }
                renderValue={(selected) => {
                    if (multiSelect) {
                        const vals = selected as string[];
                        if (vals.length === 0) return placeholder;
                        return vals.map((v) => normalizedOptions.find((o) => String(o.value) === v)?.label ?? v).join(', ');
                    }
                    const value = selected as string;
                    if (value.length > 0) {
                        const selectedOption = normalizedOptions.find((o) => String(o.value) === value);
                        if (selectedOption) return selectedOption.label;
                    }
                    return placeholder;
                }}
            >
                {/* Bug fix: use ListSubheader instead of MenuItem so clicking the search field
            does not trigger onChange with undefined */}
                {searchable && (
                    <ListSubheader sx={{ lineHeight: 'unset', padding: '6px 8px' }}>
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                width: '100%',
                                border: `1px solid ${brand.enterpriseDarkBlue}`,
                                borderRadius: '4px',
                                px: 1,
                                py: 0.5
                            }}
                        >
                            <SearchIcon sx={{ color: brand.enterpriseDarkGray, mr: 0.5, fontSize: body1.fontSize }} />
                            <InputBase
                                placeholder="Search..."
                                value={searchText}
                                onChange={(e) => {
                                    setSearchText(e.target.value);
                                }}
                                onKeyDown={(e) => {
                                    e.stopPropagation();
                                }}
                                sx={{ fontSize: body2.fontSize, flex: 1 }}
                                autoFocus
                            />
                        </Box>
                    </ListSubheader>
                )}
                {filteredOptions.length === 0 ? (
                    <MenuItem disabled>
                        <Typography sx={{ fontSize: body2.fontSize, color: brand.enterpriseDarkGray }}>
                            {searchable && searchText.trim() ? 'No results found.' : 'No options available.'}
                        </Typography>
                    </MenuItem>
                ) : (
                    filteredOptions.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                            {multiSelect && <Checkbox checked={selectedValues.includes(String(option.value))} size="small" />}
                            {multiSelect ? <ListItemText primary={option.label} /> : option.label}
                        </MenuItem>
                    ))
                )}
            </Select>
        </FormControl>
    );
};

export default CustomSelectBox;
